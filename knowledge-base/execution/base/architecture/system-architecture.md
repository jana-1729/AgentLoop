# System Architecture -- River Flow

## Overview

River Flow is a distributed, event-driven microservices platform built for automation at scale. The architecture separates concerns into distinct layers: API ingress, core domain services, execution runtime, and data persistence. Every component is stateless where possible, horizontally scalable, and communicates asynchronously via Kafka.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│   Web App (Next.js)  |  SDK (JS/Python)  |  Webhooks/API       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      GATEWAY LAYER                              │
│   Kong API Gateway  →  Auth Middleware  →  Rate Limiter         │
│   TLS termination, routing, tenant context injection            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    CORE SERVICE LAYER                            │
│   Tenant Service  |  Workflow Service  |  Integration Service   │
│   Connection Svc  |  Trigger Service   |  Scheduler Service     │
│   Billing Service |  Team/Org Service  |  Admin Service         │
│                                                                 │
│   Communication: REST (external), gRPC (internal), Kafka (async)│
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                   EXECUTION LAYER                               │
│   Kafka Event Bus  →  Worker Pool  →  Code Sandbox             │
│   BullMQ Queues    →  Retry Engine →  Dead Letter Queue        │
│   Step-by-step orchestration with state persistence             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                     DATA LAYER                                  │
│   PostgreSQL (state)  |  Redis (cache/queues)  |  Kafka (events)│
│   OpenSearch (logs)   |  ClickHouse (analytics) |  S3 (objects) │
│   Vault (secrets)                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Multi-Tenancy Model

River Flow uses a **single-database, shared-schema** approach with **Row-Level Security (RLS)** for tenant isolation.

### Why Shared Schema + RLS

- Simpler operations (one database, one migration path)
- Lower infrastructure cost at scale
- PostgreSQL RLS is enforced at the database engine level (not application)
- Large tenants can graduate to dedicated schemas or databases later

### Implementation

Every table includes a `tenant_id` column. RLS policies enforce that queries only access the calling tenant's data:

```sql
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Each database connection sets the tenant context:

```sql
SET app.current_tenant_id = '<tenant-uuid>';
```

The API gateway injects `tenant_id` from the authenticated request. Services set this on every database transaction.

### Tenant Graduation Path

```
Tier 1 (Free/Starter): Shared schema, shared compute
Tier 2 (Pro):          Shared schema, dedicated worker pool
Tier 3 (Enterprise):   Dedicated schema, dedicated compute, custom domain
Tier 4 (On-Premise):   Full deployment in customer's cloud (future)
```

---

## Service Communication Patterns

### Synchronous (Request-Response)

- **External API** (client -> gateway -> service): REST over HTTPS
- **Service-to-service** (within cluster): gRPC with protobuf
- Used for: CRUD operations, data queries, connection validation

### Asynchronous (Event-Driven)

- **Kafka**: All workflow execution events, audit events, integration events
- **BullMQ**: Retryable jobs (scheduled triggers, token refresh, webhook delivery)
- Used for: Workflow execution, event processing, billing metering, notifications

### Decision Matrix

| Operation               | Pattern | Transport | Reason                                |
| ----------------------- | ------- | --------- | ------------------------------------- |
| Create workflow          | Sync    | REST      | User expects immediate response       |
| Execute workflow         | Async   | Kafka     | Long-running, must not block          |
| Refresh OAuth token      | Async   | BullMQ    | Background, retryable                 |
| Query execution logs     | Sync    | REST      | User browsing logs                    |
| Meter usage for billing  | Async   | Kafka     | Fire-and-forget, eventual consistency |
| Validate connection      | Sync    | gRPC      | Real-time feedback needed             |
| Send alert notification  | Async   | BullMQ    | Non-critical, retryable               |

---

## Data Flow: Workflow Execution

The most critical data path in the system:

```
1. TRIGGER RECEIVED
   Client sends webhook / API call / cron fires
        │
        ▼
2. TRIGGER SERVICE
   Validates payload, resolves matching workflows
   Produces event: workflow.trigger.received
        │
        ▼
3. KAFKA: workflow.execution.start
   Event contains: workflow_id, trigger_data, execution_id
        │
        ▼
4. EXECUTION WORKER (consumer group)
   Picks up event, loads workflow definition
   Begins step-by-step execution:
        │
        ├── Step 1: Load input data
        ├── Step 2: Apply filters/conditions
        ├── Step 3: Transform data (mapping/code)
        ├── Step 4: Execute action (call external API)
        ├── Step 5: Handle response
        └── Step N: Continue to next step or branch
        │
        ▼
5. PER-STEP PERSISTENCE
   Each step result written to PostgreSQL (execution_steps table)
   Allows resume on failure
        │
        ▼
6. COMPLETION
   Produce event: workflow.execution.completed
   Write final status to PostgreSQL
   Write detailed log to OpenSearch
   Emit metering event to ClickHouse
```

### Failure Handling in Execution

```
Step fails
    │
    ▼
Check retry policy (max_retries, backoff)
    │
    ├── Retries remaining → Re-queue step to Kafka with delay
    │
    └── Retries exhausted → Move to DLQ
                              │
                              ├── Mark execution as FAILED
                              ├── Send alert to user
                              └── Log to OpenSearch for debugging
```

---

## Service Boundaries

### Bounded Contexts (Domain-Driven Design)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│   Identity   │  │  Automation  │  │   Integration     │
│   Context    │  │   Context    │  │    Context        │
│              │  │              │  │                   │
│ - Tenants    │  │ - Workflows  │  │ - Connectors      │
│ - Teams      │  │ - Executions │  │ - Connections      │
│ - Users      │  │ - Triggers   │  │ - OAuth flows      │
│ - Auth       │  │ - Schedules  │  │ - Token management │
└──────────────┘  └──────────────┘  └──────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Operations  │  │   Commerce   │  │   Platform        │
│   Context    │  │   Context    │  │    Context        │
│              │  │              │  │                   │
│ - Logs       │  │ - Plans      │  │ - Marketplace     │
│ - Monitoring │  │ - Billing    │  │ - Templates       │
│ - Alerts     │  │ - Metering   │  │ - AI features     │
│ - Audit      │  │ - Invoices   │  │ - Admin tools     │
└──────────────┘  └──────────────┘  └──────────────────┘
```

Each context owns its data and exposes it only via APIs or events. No direct database access across context boundaries.

---

## API Versioning

All external APIs are versioned:

```
/api/v1/workflows
/api/v1/executions
/api/v2/workflows  (when breaking changes are introduced)
```

### Strategy
- URI-based versioning for simplicity
- Old versions supported for 12 months after deprecation notice
- Internal gRPC services use protobuf schema evolution (backward-compatible field additions)

---

## Idempotency

All write operations support idempotency to handle retries safely:

```
POST /api/v1/workflows/execute
Headers:
  X-Idempotency-Key: <client-generated-uuid>
```

Implementation:
- Store idempotency key + response in Redis (TTL: 24h)
- On duplicate request, return cached response
- Critical for webhook triggers that may be delivered multiple times

---

## Cross-Cutting Concerns

### Request Tracing

Every request gets a unique `X-Request-ID` at the API gateway. This ID propagates through:
- HTTP headers (REST/gRPC)
- Kafka message headers
- BullMQ job metadata
- Log entries (structured JSON)
- OpenSearch documents

Distributed tracing via OpenTelemetry with Tempo as the trace backend.

### Health Checks

Every service exposes:
- `GET /health/live` -- Kubernetes liveness probe (is the process alive?)
- `GET /health/ready` -- Kubernetes readiness probe (can it serve traffic?)
  - Checks: database connection, Redis connection, Kafka consumer group

### Configuration

All service configuration via environment variables, following 12-factor app principles:
- Secrets injected from External Secrets Operator
- Feature flags via a flags service (backed by Redis)
- Runtime config changes without redeployment where possible

---

## Scalability Targets

| Component          | Initial Scale     | Target at 1M Workflows |
| ------------------ | ----------------- | ---------------------- |
| API pods           | 3 replicas        | 20+ replicas (HPA)    |
| Workflow service   | 3 replicas        | 10+ replicas           |
| Execution workers  | 5 replicas        | 100+ replicas (KEDA)  |
| Kafka partitions   | 12 per topic      | 64+ per topic          |
| PostgreSQL         | 1 writer + 2 read | 1 writer + 5 read     |
| Redis              | 3 shards          | 10+ shards             |
| OpenSearch         | 3 data nodes      | 10+ data nodes         |
