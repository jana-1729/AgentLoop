# Worker Architecture -- River Flow

## Overview

Workers are the execution backbone of River Flow. They consume workflow execution events from Kafka, orchestrate step-by-step execution, call external APIs, run user code in sandboxes, and persist results. Workers are stateless, horizontally scalable, and designed for fault tolerance.

---

## Worker Types

### 1. Execution Workers (Primary)

Consume `workflow.execution.start` and `workflow.execution.step` topics. Responsible for the core workflow execution loop.

```
Deployment:
  Replicas: 5 (min) to 100+ (max)
  Scaling: KEDA (based on Kafka consumer lag)
  Instance type: c6i.2xlarge (compute-optimized)
  Node pool: dedicated "workers" taint
  Resource limits:
    CPU: 2 cores per pod
    Memory: 4Gi per pod
  Concurrency: 10 concurrent executions per pod
```

### 2. Sandbox Workers

Execute user-provided code (JavaScript/Python) in isolated environments.

```
Deployment:
  Replicas: 2 (min) to 30 (max)
  Scaling: KEDA (based on sandbox queue depth)
  Instance type: c6i.xlarge
  Node pool: dedicated "sandbox" taint with seccomp/AppArmor
  Resource limits per sandbox:
    CPU: 0.5 cores
    Memory: 256MB
    Execution time: 30 seconds (hard kill)
    Network: egress only to allowlisted hosts
```

### 3. Polling Workers

Execute periodic polling jobs for integrations that do not support webhooks.

```
Deployment:
  Replicas: 2 (min) to 20 (max)
  Scaling: KEDA (based on BullMQ queue depth)
  Dedicated BullMQ queue: polling-jobs
  Poll interval: configurable per integration (1min to 15min)
```

---

## Execution Flow

### Step-by-Step Orchestration

```
1. RECEIVE EVENT
   Consumer picks up message from workflow.execution.start
   Event contains: execution_id, workflow_id, workflow_version, trigger_data

2. LOAD WORKFLOW DEFINITION
   Fetch from workflow-service via gRPC (cached in Redis for 5 min)
   Contains: ordered list of steps with configuration

3. INITIALIZE EXECUTION
   Create execution record in PostgreSQL (status: running)
   Set up execution context (variables, trigger data)

4. EXECUTE STEPS SEQUENTIALLY
   For each step in the workflow:
     a. Resolve input data (map fields from previous steps + trigger data)
     b. Execute step based on type:
        - ACTION: Call external API via connection service
        - FILTER: Evaluate condition, skip remaining if false
        - DELAY: Schedule continuation after delay period
        - BRANCH: Evaluate condition, follow matching path
        - LOOP: Iterate through array, execute sub-steps for each item
        - CODE: Send to sandbox worker for execution
        - SEARCH: Query external API, return data
     c. Persist step result to execution_steps table
     d. If step fails, enter retry/error handling flow

5. COMPLETE EXECUTION
   Set execution status to completed/failed
   Produce workflow.execution.completed event
   Produce billing.usage.event
```

### Execution Context

Each execution maintains a context object that accumulates data across steps:

```typescript
interface ExecutionContext {
  execution_id: string;
  tenant_id: string;
  workflow_id: string;
  trigger_data: Record<string, any>;
  step_results: Map<string, StepResult>;  // step_id -> output
  variables: Record<string, any>;          // user-defined variables
  metadata: {
    started_at: Date;
    current_step: number;
    retry_count: number;
  };
}
```

Steps reference data from previous steps using expressions:

```
{{trigger.data.email}}
{{steps.step_1.output.contact_id}}
{{variables.api_key}}
```

---

## Scaling Strategy

### KEDA Autoscaling

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: execution-worker-scaler
spec:
  scaleTargetRef:
    name: execution-worker
  minReplicaCount: 5
  maxReplicaCount: 100
  pollingInterval: 15
  cooldownPeriod: 300
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: execution-workers
        topic: workflow.execution.start
        lagThreshold: "50"
    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: execution-workers
        topic: workflow.execution.step
        lagThreshold: "100"
```

### Scaling Behavior

```
Lag < 50:    Maintain min replicas (5)
Lag 50-200:  Scale up gradually (1 pod per 50 lag)
Lag 200-500: Scale up aggressively (2 pods per 50 lag)
Lag > 500:   Emergency scale (jump to max allowed by Karpenter nodes)

Scale down: Cooldown 5 minutes, remove 1 pod at a time
  - Graceful shutdown: finish in-progress executions before terminating
```

---

## Fault Tolerance

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  // 1. Stop consuming new messages from Kafka
  await consumer.disconnect();

  // 2. Wait for in-progress executions to complete (max 60s)
  await waitForInflightExecutions(60_000);

  // 3. For any still-running executions, save checkpoint
  await checkpointRunningExecutions();

  // 4. Exit cleanly
  process.exit(0);
});
```

Kubernetes terminationGracePeriodSeconds: 90 seconds

### Checkpoint and Resume

If a worker dies mid-execution:

```
1. Execution status remains "running" in DB
2. Heartbeat monitor detects stale executions (no heartbeat for 2 min)
3. Stale execution is re-queued to Kafka
4. A new worker picks it up
5. Worker loads execution state from DB (last completed step)
6. Resumes from the next step (does not re-execute completed steps)
```

Heartbeat mechanism:
```
Each running execution updates a Redis key every 30 seconds:
  Key: execution:heartbeat:<execution_id>
  Value: { worker_id, step_index, updated_at }
  TTL: 120 seconds (auto-expires if worker dies)
```

### Execution Timeout

```
Per-step timeout: 60 seconds (configurable per step type)
Per-execution timeout: 15 minutes (configurable per plan)
  Free: 5 minutes
  Pro: 15 minutes
  Enterprise: 60 minutes

On timeout:
  1. Kill the current step
  2. Mark execution as TIMED_OUT
  3. Produce failure event
  4. Alert user
```

---

## Resource Isolation

### Per-Tenant Worker Pools (Enterprise)

Enterprise tenants can opt for dedicated worker pools:

```yaml
Dedicated pool:
  - Separate Kubernetes Deployment
  - Separate Kafka consumer group
  - Separate topic partition assignment
  - Isolated from noisy neighbors
  - Custom resource limits
  - Custom timeout limits
```

### Pod Resource Limits

```yaml
resources:
  requests:
    cpu: "1"
    memory: "2Gi"
  limits:
    cpu: "2"
    memory: "4Gi"
```

Memory limit protects against runaway executions. OOMKill triggers execution failure and re-queue.

---

## Code Sandbox Architecture

### JavaScript (V8 Isolates)

```
Library: isolated-vm
Execution model:
  1. Create new V8 isolate (separate heap)
  2. Set memory limit: 128MB
  3. Inject input data as frozen global
  4. Execute user code with CPU time limit: 10 seconds
  5. Extract return value
  6. Destroy isolate

Security:
  - No access to Node.js APIs (fs, net, process, etc.)
  - No require/import
  - No setTimeout/setInterval
  - Deterministic execution (no Date.now randomness)
  - Memory and CPU strictly bounded
```

### Python (Firecracker microVMs)

```
Execution model:
  1. Spawn Firecracker microVM from pre-built rootfs
  2. Boot time: ~125ms
  3. Pass input data via virtio socket
  4. Execute user Python script
  5. Capture stdout as output
  6. Destroy microVM

Security:
  - Full kernel-level isolation (separate Linux kernel)
  - No network access by default
  - No filesystem persistence
  - CPU and memory cgroups enforced
  - Maximum execution time: 30 seconds
```

---

## Monitoring Workers

### Metrics (Prometheus)

```
river_flow_execution_duration_seconds{workflow_id, status}    -- Histogram
river_flow_execution_step_duration_seconds{step_type, status} -- Histogram
river_flow_executions_in_progress{worker_id}                  -- Gauge
river_flow_executions_total{status}                           -- Counter
river_flow_worker_kafka_lag{topic, consumer_group}            -- Gauge
river_flow_sandbox_execution_duration_seconds{language}       -- Histogram
river_flow_sandbox_oom_kills_total                            -- Counter
```

### Alerts

| Alert                              | Condition                      | Action                    |
| ---------------------------------- | ------------------------------ | ------------------------- |
| High Kafka lag                     | Lag > 500 for 5 min           | Scale workers             |
| Execution failure rate spike       | > 5% failure rate             | Investigate, page on-call |
| Worker OOM kills                   | > 3 OOM kills in 10 min      | Increase memory limits    |
| Execution timeout rate             | > 2% timeout rate             | Check external API health |
| Sandbox execution failure          | > 10% sandbox failures        | Check sandbox pool health |
| Stale executions (no heartbeat)    | > 10 stale for 5 min         | Check worker health       |
