# Queue Architecture -- River Flow

## Overview

River Flow uses a dual-queue architecture: Apache Kafka for high-throughput event streaming and BullMQ (Redis-backed) for discrete job processing. This separation allows each system to be optimized for its specific use case while providing comprehensive async processing capabilities.

---

## Kafka Topics -- Complete Layout

### Naming Convention

```
{domain}.{entity}.{event_type}

Domains: workflow, trigger, integration, billing, platform
```

### Topic Catalog

#### Workflow Domain

| Topic                                  | Partitions | Key          | Retention | Purpose                              |
| -------------------------------------- | ---------- | ------------ | --------- | ------------------------------------ |
| `workflow.execution.start`             | 32         | workflow_id  | 7 days    | New execution requests               |
| `workflow.execution.step`              | 32         | execution_id | 7 days    | Step-by-step routing between workers |
| `workflow.execution.completed`         | 16         | tenant_id    | 7 days    | Successful completion events         |
| `workflow.execution.failed`            | 16         | tenant_id    | 14 days   | Failed execution events              |
| `workflow.execution.step_completed`    | 16         | execution_id | 3 days    | Individual step results              |
| `workflow.definition.changed`          | 8          | workflow_id  | 3 days    | Workflow created/updated/published   |

#### Trigger Domain

| Topic                                  | Partitions | Key             | Retention | Purpose                          |
| -------------------------------------- | ---------- | --------------- | --------- | -------------------------------- |
| `trigger.webhook.received`             | 16         | endpoint_id     | 3 days    | Raw webhook payloads             |
| `trigger.schedule.fired`               | 8          | schedule_id     | 3 days    | Schedule trigger events          |
| `trigger.poll.data_found`              | 8          | connection_id   | 3 days    | New data from polling            |

#### Integration Domain

| Topic                                  | Partitions | Key             | Retention | Purpose                          |
| -------------------------------------- | ---------- | --------------- | --------- | -------------------------------- |
| `integration.connection.changed`       | 8          | connection_id   | 3 days    | Connection created/updated       |
| `integration.token.refresh_needed`     | 8          | connection_id   | 1 day     | Token expiring soon              |
| `integration.connection.state`         | 8 (compact)| connection_id   | Infinite  | Latest connection health state   |

#### Billing Domain

| Topic                                  | Partitions | Key          | Retention | Purpose                          |
| -------------------------------------- | ---------- | ------------ | --------- | -------------------------------- |
| `billing.usage.event`                  | 8          | tenant_id    | 30 days   | Usage metering events            |

#### Platform Domain

| Topic                                  | Partitions | Key          | Retention | Purpose                          |
| -------------------------------------- | ---------- | ------------ | --------- | -------------------------------- |
| `platform.audit.log`                   | 8          | tenant_id    | 30 days   | Audit trail events               |
| `platform.notification.send`           | 8          | tenant_id    | 3 days    | Notification dispatch            |

#### Dead Letter Topics

Every consumer group has a DLT:

| DLT Topic                                     | Source Topic                   | Retention |
| --------------------------------------------- | ------------------------------ | --------- |
| `workflow.execution.start.dlt`                | workflow.execution.start       | 30 days   |
| `workflow.execution.step.dlt`                 | workflow.execution.step        | 30 days   |
| `trigger.webhook.received.dlt`                | trigger.webhook.received       | 30 days   |

---

## Kafka Consumer Groups

| Consumer Group             | Topics Consumed                        | Service           | Scaling     |
| -------------------------- | -------------------------------------- | ----------------- | ----------- |
| `execution-workers`        | workflow.execution.start, .step        | Execution Worker  | KEDA (lag)  |
| `logging-writer`           | workflow.execution.*                   | Logging Service   | HPA (CPU)   |
| `billing-metering`         | billing.usage.event                    | Billing Service   | HPA (CPU)   |
| `notification-sender`      | platform.notification.send             | Notification Svc  | HPA (CPU)   |
| `audit-log-writer`         | platform.audit.log                     | Logging Service   | HPA (CPU)   |
| `token-refresh-monitor`    | integration.token.refresh_needed       | Connection Svc    | Fixed (3)   |
| `dlq-processor`            | *.dlt                                  | Admin Service     | Fixed (2)   |

---

## Kafka Producer Configuration

```typescript
const producer = kafka.producer({
  idempotent: true,                    // Exactly-once per partition
  transactionalId: `worker-${podId}`,  // For transactional produces
  maxInFlightRequests: 5,
  retry: {
    retries: 5,
    initialRetryTime: 300,
    factor: 2,
    maxRetryTime: 30000,
  },
  compression: CompressionTypes.LZ4,
});
```

### Message Structure

```typescript
interface KafkaMessage {
  key: string;       // Partition key (e.g., workflow_id)
  value: string;     // JSON or Avro encoded event body
  headers: {
    'ce-id': string;           // CloudEvents ID
    'ce-type': string;         // Event type
    'ce-source': string;       // Producing service
    'ce-time': string;         // ISO timestamp
    'x-tenant-id': string;    // Tenant isolation
    'x-trace-id': string;     // Distributed tracing
    'x-correlation-id': string;
  };
}
```

---

## Kafka Consumer Configuration

```typescript
const consumer = kafka.consumer({
  groupId: 'execution-workers',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576,  // 1MB
  maxWaitTimeInMs: 5000,
  retry: {
    retries: 3,
    initialRetryTime: 100,
    factor: 2,
  },
});

await consumer.subscribe({
  topics: ['workflow.execution.start', 'workflow.execution.step'],
  fromBeginning: false,
});

await consumer.run({
  autoCommit: false,  // Manual offset management
  eachMessage: async ({ topic, partition, message }) => {
    try {
      await processMessage(message);
      await consumer.commitOffsets([{
        topic, partition, offset: (Number(message.offset) + 1).toString()
      }]);
    } catch (error) {
      await handleProcessingError(topic, message, error);
    }
  },
});
```

---

## Retry Policies (Kafka)

### Strategy: Retry Topic with Exponential Backoff

```
Attempt 1: Process immediately
Attempt 2: Wait 5 seconds  → produce to workflow.execution.start.retry-1
Attempt 3: Wait 30 seconds → produce to workflow.execution.start.retry-2
Attempt 4: Wait 2 minutes  → produce to workflow.execution.start.retry-3
All failed: Move to DLT     → produce to workflow.execution.start.dlt
```

Implementation uses delayed retry topics with Kafka consumer pause/resume:

```typescript
async function handleProcessingError(topic: string, message: KafkaMessage, error: Error) {
  const retryCount = getRetryCount(message);
  const maxRetries = 3;

  if (retryCount < maxRetries) {
    const delay = calculateBackoff(retryCount); // 5s, 30s, 120s
    await producer.send({
      topic: `${topic}.retry-${retryCount + 1}`,
      messages: [{
        ...message,
        headers: { ...message.headers, 'x-retry-count': String(retryCount + 1) },
        timestamp: String(Date.now() + delay),
      }],
    });
  } else {
    await producer.send({
      topic: `${topic}.dlt`,
      messages: [{
        ...message,
        headers: {
          ...message.headers,
          'x-error-message': error.message,
          'x-original-topic': topic,
          'x-failed-at': new Date().toISOString(),
        },
      }],
    });
  }
}
```

---

## BullMQ Queues -- Complete Layout

### Queue Catalog

| Queue Name               | Concurrency | Max Retries | Backoff           | Purpose                             |
| ------------------------ | ----------- | ----------- | ----------------- | ----------------------------------- |
| `token-refresh`          | 10          | 3           | Exp (30s base)    | Refresh expiring OAuth tokens       |
| `webhook-delivery`       | 20          | 5           | Exp (10s base)    | Deliver webhook notifications       |
| `schedule-evaluator`     | 1           | 1           | --                | Repeating: evaluate due schedules   |
| `schedule-trigger`       | 10          | 3           | Exp (5s base)     | Fire individual scheduled workflows |
| `polling-jobs`           | 10          | 2           | Fixed (60s)       | Poll integrations for new data      |
| `connection-health`      | 5           | 2           | Fixed (30s)       | Validate connection health          |
| `email-notification`     | 5           | 3           | Exp (10s base)    | Send email alerts                   |
| `cleanup-archive`        | 1           | 1           | --                | Archive/delete old data             |
| `connector-package-build`| 2           | 1           | --                | Build connector SDK packages        |

### BullMQ Worker Configuration

```typescript
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const tokenRefreshWorker = new Worker(
  'token-refresh',
  async (job) => {
    const { connectionId, tenantId } = job.data;
    await refreshOAuthToken(connectionId, tenantId);
  },
  {
    connection,
    concurrency: 10,
    limiter: {
      max: 50,           // Max 50 jobs
      duration: 60_000,  // Per 60 seconds (respect OAuth provider limits)
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  }
);
```

### Repeating Jobs (Cron-like)

```typescript
const scheduleQueue = new Queue('schedule-evaluator', { connection });

await scheduleQueue.add(
  'evaluate-due-schedules',
  {},
  {
    repeat: {
      every: 30_000,  // Run every 30 seconds
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  }
);
```

---

## Priority Queues

### Kafka Priority via Separate Topics

```
workflow.execution.start.high     -- Enterprise tenants (consumed first)
workflow.execution.start.normal   -- Pro tenants
workflow.execution.start.low      -- Free tenants

Workers consume from high first:
  consumer.subscribe({ topics: [
    'workflow.execution.start.high',
    'workflow.execution.start.normal',
    'workflow.execution.start.low',
  ]});

Weighted consumption:
  70% capacity for high priority
  20% for normal
  10% for low
```

### BullMQ Priority

```typescript
await webhookDeliveryQueue.add(
  'deliver',
  { url, payload, webhookId },
  {
    priority: tenant.plan === 'enterprise' ? 1 : tenant.plan === 'pro' ? 5 : 10,
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
  }
);
```

---

## Dead Letter Queue Processing

### DLQ Dashboard

Admin service exposes APIs for DLQ management:

```
GET    /admin/dlq/messages              -- List DLQ messages (paginated)
GET    /admin/dlq/messages/:id          -- Get DLQ message detail
POST   /admin/dlq/messages/:id/retry    -- Retry a single message
POST   /admin/dlq/messages/retry-all    -- Retry all messages for a topic
DELETE /admin/dlq/messages/:id          -- Discard message
```

### Auto-Retry on Fix

When a bug is fixed and deployed:
1. Admin triggers "retry all" for the affected DLT topic
2. Messages are re-published to the original topic
3. New consumer version processes them correctly

---

## Backpressure Handling

### Kafka Consumer Backpressure

```
Signal: Consumer lag grows beyond threshold

Response:
  1. KEDA scales up consumer pods (more parallelism)
  2. If lag continues growing, producer-side throttling activates
  3. Rate limiting at API gateway reduces incoming event rate
  4. Alert to ops team for investigation
```

### BullMQ Backpressure

```
Signal: Queue depth exceeds threshold

Response:
  1. Increase concurrency on existing workers
  2. Scale worker pods (HPA on custom metric: queue depth)
  3. If queue depth > 10000, activate circuit breaker
     - New jobs rejected with 503 (try again later)
     - Alert to ops team
```

### Circuit Breaker per Integration

```typescript
// Per-integration circuit breaker prevents cascading failures
const breaker = new CircuitBreaker({
  integrationId: 'salesforce',
  failureThreshold: 5,     // 5 consecutive failures
  resetTimeout: 60_000,    // Try again after 60 seconds
  halfOpenRequests: 2,     // Allow 2 test requests in half-open
});

// When Salesforce is down, all Salesforce-related executions
// are paused (not failed), and resume when the circuit closes.
```

---

## Monitoring

### Kafka Metrics

```
kafka_consumer_group_lag{group, topic, partition}
kafka_topic_messages_in_per_sec{topic}
kafka_topic_bytes_in_per_sec{topic}
kafka_consumer_fetch_latency_avg{group}
kafka_producer_record_send_rate{client_id}
```

### BullMQ Metrics

```
bullmq_queue_waiting{queue}          -- Jobs waiting to be processed
bullmq_queue_active{queue}           -- Jobs currently being processed
bullmq_queue_completed{queue}        -- Total completed jobs
bullmq_queue_failed{queue}           -- Total failed jobs
bullmq_queue_delayed{queue}          -- Jobs waiting for delay
bullmq_job_duration_seconds{queue}   -- Job processing duration
```

### Grafana Dashboards

- **Queue Overview**: All queues with depth, throughput, latency
- **Kafka Lag Monitor**: Per consumer group, per topic, trend analysis
- **DLQ Monitor**: Dead letter queue depth, age of oldest message
- **Priority Distribution**: How work is distributed across priority levels
