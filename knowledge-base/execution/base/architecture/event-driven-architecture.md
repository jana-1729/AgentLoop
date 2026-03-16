# Event-Driven Architecture -- River Flow

## Overview

Kafka is the central nervous system of River Flow. Every significant state change produces an event. Services react to events asynchronously, enabling loose coupling, high throughput, and fault tolerance. This document defines the event topology, schemas, consumer patterns, and guarantees.

---

## Event Bus: Apache Kafka (MSK)

### Why Kafka

- Proven at scale (billions of events/day at LinkedIn, Uber, Netflix)
- Durable, ordered, replayable log
- Consumer group model enables parallel processing
- Exactly-once semantics with transactions
- Rich ecosystem (Kafka Connect, Schema Registry, ksqlDB)

### Cluster Configuration

```
Production (MSK Serverless):
  - Auto-scaling throughput
  - Default retention: 7 days
  - Max message size: 1MB (larger payloads use S3 reference)
  - Encryption: TLS in-transit, KMS at-rest
  - Authentication: IAM-based access

Topic naming convention:
  {domain}.{entity}.{event_type}

Examples:
  workflow.execution.started
  workflow.execution.step_completed
  workflow.execution.completed
  workflow.execution.failed
  trigger.webhook.received
  trigger.schedule.fired
  integration.connection.created
  integration.token.refresh_needed
  billing.usage.recorded
  platform.audit.event
```

---

## Topic Design

### Core Topics

| Topic                                | Partitions | Retention | Consumers                        |
| ------------------------------------ | ---------- | --------- | -------------------------------- |
| workflow.execution.start             | 32         | 7 days    | Execution workers                |
| workflow.execution.step              | 32         | 7 days    | Execution workers (step router)  |
| workflow.execution.completed         | 16         | 7 days    | Logging, billing, notifications  |
| workflow.execution.failed            | 16         | 14 days   | DLQ processor, alerting          |
| trigger.webhook.received             | 16         | 3 days    | Trigger service                  |
| trigger.schedule.fired               | 8          | 3 days    | Trigger service                  |
| integration.token.refresh            | 8          | 1 day     | Token manager                    |
| billing.usage.event                  | 8          | 30 days   | Billing aggregator               |
| platform.audit.log                   | 8          | 30 days   | Audit log writer                 |
| platform.notification.send           | 8          | 3 days    | Notification service             |

### Dead Letter Topics

Every consumer group has a corresponding DLT:

```
workflow.execution.start.dlt
workflow.execution.step.dlt
trigger.webhook.received.dlt
```

Events land in DLT after exhausting retries. A DLQ processor service provides:
- Dashboard visibility into failed events
- Manual retry capability
- Auto-cleanup after 30 days

### Partitioning Strategy

Partition key selection is critical for ordering guarantees and load distribution:

| Topic                         | Partition Key          | Reason                                    |
| ----------------------------- | ---------------------- | ----------------------------------------- |
| workflow.execution.start      | workflow_id            | All executions of a workflow in order      |
| workflow.execution.step       | execution_id           | Steps within an execution processed in order |
| trigger.webhook.received      | webhook_endpoint_id    | Preserve per-endpoint ordering             |
| billing.usage.event           | tenant_id              | Aggregate usage per tenant                 |
| platform.audit.log            | tenant_id              | Audit events grouped by tenant             |

---

## Event Schema

### Format: CloudEvents Specification

All events follow the CloudEvents v1.0 spec, serialized as JSON (migrating to Avro for production efficiency).

```json
{
  "specversion": "1.0",
  "id": "evt_abc123def456",
  "source": "river-flow/trigger-service",
  "type": "workflow.execution.start",
  "time": "2026-03-15T10:30:00Z",
  "datacontenttype": "application/json",
  "subject": "wf_xyz789",
  "riverflow": {
    "tenant_id": "tenant_abc",
    "trace_id": "trace_123",
    "correlation_id": "corr_456"
  },
  "data": {
    "execution_id": "exec_001",
    "workflow_id": "wf_xyz789",
    "workflow_version": 3,
    "trigger_type": "webhook",
    "trigger_data": { "email": "user@example.com" }
  }
}
```

### Schema Registry

AWS Glue Schema Registry stores Avro schemas for all event types:

```
Schemas:
  workflow.execution.start-v1.avsc
  workflow.execution.step_completed-v1.avsc
  workflow.execution.completed-v1.avsc
  ...

Evolution rules:
  - Backward compatible (new fields must have defaults)
  - No field removal without deprecation period
  - Schema validation enforced on producer side
```

---

## Consumer Patterns

### 1. Simple Consumer (Single Purpose)

One consumer group processing one topic for one purpose.

```
Topic: workflow.execution.completed
Consumer Group: logging-service-writer
Action: Write execution log to OpenSearch
```

### 2. Fan-Out (Multiple Consumers on Same Topic)

Multiple consumer groups independently process the same topic.

```
Topic: workflow.execution.completed
├── Consumer Group: logging-service       → Write to OpenSearch
├── Consumer Group: billing-metering      → Record usage in ClickHouse
├── Consumer Group: notification-service  → Send completion notification
└── Consumer Group: analytics-service     → Update dashboard metrics
```

### 3. Saga Pattern (Multi-Step Orchestration)

Workflow execution uses a saga pattern for step-by-step processing:

```
execution.start → Worker picks up
  → Executes Step 1
  → Produces: execution.step (step_2_ready)
  → Worker picks up Step 2
  → Produces: execution.step (step_3_ready)
  → ...
  → Final step completes
  → Produces: execution.completed
```

Each step is an independent event. If a step fails, the saga can:
- Retry the failed step
- Execute compensation logic
- Move to error branch
- Halt and notify

### 4. Compacted Topics (State Store)

For data that needs latest-value semantics:

```
Topic: integration.connection.state (compacted)
Key: connection_id
Value: { status, last_validated_at, token_expires_at }

Consumers read the latest state for each connection.
Used by: Token refresh scheduler, connection health dashboard
```

---

## Exactly-Once Semantics

### Producer Side

Kafka transactions ensure that producing an event and committing a consumer offset happen atomically:

```typescript
const producer = kafka.producer({
  transactionalId: 'execution-worker-1',
  idempotent: true,
});

const transaction = await producer.transaction();
try {
  await transaction.send({
    topic: 'workflow.execution.step',
    messages: [{ key: executionId, value: stepResult }],
  });
  await transaction.sendOffsets({
    consumerGroupId: 'execution-workers',
    topics: [{ topic: 'workflow.execution.start', partitions }],
  });
  await transaction.commit();
} catch (e) {
  await transaction.abort();
}
```

### Consumer Side

- `enable.auto.commit = false`
- Manual offset commit after successful processing
- Consumer isolation level: `read_committed` (only see committed transactions)

---

## Backpressure Handling

### Problem
If consumers fall behind producers, Kafka lag grows, memory pressure increases, and latency spikes.

### Solutions

1. **KEDA Auto-Scaling**: Scale consumer pods based on Kafka consumer lag
   ```yaml
   triggers:
     - type: kafka
       metadata:
         topic: workflow.execution.start
         consumerGroup: execution-workers
         lagThreshold: "100"  # scale up when lag > 100
   ```

2. **Producer Throttling**: Rate-limit event production per tenant
   ```
   Free tier:  10 events/second
   Pro tier:   100 events/second
   Enterprise: 1000 events/second
   ```

3. **Priority Queues**: Separate topics for priority levels
   ```
   workflow.execution.start.high    -- Enterprise tenants
   workflow.execution.start.normal  -- Pro tenants
   workflow.execution.start.low     -- Free tenants
   ```
   Workers consume from high first, then normal, then low.

---

## Event Replay and Recovery

### Replay Scenarios

1. **Bug fix replay**: A consumer had a bug, processed events incorrectly. Fix the bug, reset consumer offset, replay from a specific timestamp.

2. **New consumer backfill**: A new service needs to process historical events. Start consuming from the beginning of the topic.

3. **Disaster recovery**: A data store was corrupted. Replay events to rebuild state.

### Implementation

```bash
# Reset consumer group offset to timestamp
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group logging-service \
  --topic workflow.execution.completed \
  --reset-offsets \
  --to-datetime 2026-03-01T00:00:00.000 \
  --execute
```

### Long-Term Event Archive

Events older than Kafka retention are archived to S3:

```
Kafka Connect S3 Sink Connector:
  Topics: all platform.audit.* topics
  Format: Parquet (columnar, compressed)
  Partitioning: by date (YYYY/MM/DD)
  Bucket: river-flow-event-archive-{env}

Replay from archive:
  S3 -> Kafka Connect S3 Source -> Topic (replay)
```

---

## Monitoring Kafka Health

### Key Metrics (Prometheus via JMX Exporter)

| Metric                              | Alert Threshold   | Action                     |
| ----------------------------------- | ----------------- | -------------------------- |
| Consumer lag (per group)            | > 1000 for 5 min  | Scale consumers            |
| Under-replicated partitions         | > 0 for 2 min     | Investigate broker health  |
| Request latency (p99)              | > 500ms           | Check broker load          |
| Bytes in/out per second             | > 80% capacity    | Scale brokers              |
| Failed produce requests             | > 0               | Check producer config      |

### Grafana Dashboards

- **Kafka Overview**: Broker health, partition distribution, throughput
- **Consumer Lag**: Per consumer group, per topic, with trend lines
- **Event Flow**: Real-time visualization of events flowing through the system
- **DLQ Monitor**: Dead letter queue depth, age of oldest message

---

## BullMQ Integration (Redis-Based Queues)

While Kafka handles event streaming, BullMQ handles discrete retryable jobs:

### Use Cases

| Queue                  | Purpose                            | Concurrency | Retry |
| ---------------------- | ---------------------------------- | ----------- | ----- |
| token-refresh          | Refresh expiring OAuth tokens      | 10          | 3     |
| webhook-delivery       | Deliver webhook notifications      | 20          | 5     |
| schedule-trigger       | Fire scheduled workflow triggers   | 10          | 3     |
| connector-health-check | Periodic connection validation     | 5           | 2     |
| email-notification     | Send email alerts                  | 5           | 3     |
| cleanup-job            | Archive old executions, partitions | 1           | 1     |

### Why BullMQ + Kafka (Not Just One)

- **Kafka** is for high-throughput, ordered event streams where replay matters
- **BullMQ** is for discrete jobs that need: delayed execution, cron repeat, priority, rate limiting per queue, and simpler retry semantics
- They complement each other: Kafka for the execution pipeline, BullMQ for operational tasks
