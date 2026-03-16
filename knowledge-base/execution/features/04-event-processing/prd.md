# Feature PRD: Event Processing System

## Problem Statement

Workflows are triggered by events from external systems. These events arrive via webhooks, API calls, polling, and schedules. The event processing system must ingest events at high throughput, validate and route them to the correct workflows, deduplicate repeated deliveries, and ensure no events are lost even under heavy load.

---

## User Stories

1. **As a user**, I want my workflow to trigger instantly when an external app sends a webhook, so my automation runs in real-time.
2. **As a user**, I want to trigger workflows via API call from my backend application.
3. **As a user**, I want my workflow to poll an integration periodically and trigger when new data is found.
4. **As a user**, I want duplicate webhook deliveries to be ignored, so my workflow does not run twice for the same event.
5. **As an admin**, I want to replay failed events so that no data is lost during outages.

---

## Event Sources

### 1. Webhooks (Push)

External applications POST data to a River Flow endpoint.

```
Endpoint: POST https://hooks.riverflow.io/:endpoint_id
Headers: Content-Type, X-Signature (integration-specific)
Body: Raw JSON payload from the external app

Processing:
  1. Receive raw HTTP request
  2. Look up endpoint_id in webhook_endpoints table (Redis cache)
  3. Verify signature (HMAC-SHA256 with endpoint secret)
  4. Validate payload size (< 1MB)
  5. Produce event to Kafka: trigger.webhook.received
  6. Return 200 OK immediately (acknowledge receipt)
  7. Worker resolves matching workflows and starts executions
```

### 2. API Triggers (Push)

Users or their applications call the River Flow API directly.

```
Endpoint: POST /api/v1/triggers/api/:workflow_id
Headers: Authorization (JWT or API Key)
Body: Custom payload

Processing:
  1. Authenticate request (Kong extracts tenant_id)
  2. Validate workflow exists and is active
  3. Validate payload against trigger schema (if defined)
  4. Check idempotency key (X-Idempotency-Key header)
  5. Produce event to Kafka: workflow.execution.start
  6. Return 202 Accepted with execution_id
```

### 3. Polling (Pull)

For integrations without webhook support, River Flow periodically polls for new data.

```
Configuration:
  - Poll interval: 1 min, 5 min, 15 min (plan-dependent)
  - Cursor tracking: timestamp or ID of last seen record
  - Deduplication: Redis set of recently seen record IDs

Processing:
  1. BullMQ repeating job fires at configured interval
  2. Polling worker calls integration API with cursor
  3. Compare results with previously seen records
  4. For each new record: produce trigger event to Kafka
  5. Update cursor to latest record
```

### 4. App Events (Push via Integration)

Managed webhook subscriptions through the integration platform.

```
Setup:
  1. User enables an app trigger (e.g., "New Salesforce Contact")
  2. Integration service calls Salesforce API to create a webhook subscription
  3. Salesforce sends events to a managed webhook endpoint

Processing identical to standard webhooks, but:
  - Lifecycle managed by the platform (subscribe on activate, unsubscribe on deactivate)
  - Signature verification per integration specification
```

---

## Event Processing Pipeline

```
Event Source (webhook/API/poll/schedule)
        │
        ▼
┌──────────────────┐
│  Trigger Service  │
│                   │
│  1. Validate      │
│  2. Authenticate  │
│  3. Deduplicate   │
│  4. Route         │
└────────┬──────────┘
         │
         ▼
┌──────────────────┐
│  Kafka Topic      │
│  trigger.*.received│
└────────┬──────────┘
         │
         ▼
┌──────────────────┐
│  Event Router     │
│  (Consumer)       │
│                   │
│  1. Load matching │
│     workflows     │
│  2. Fan out:      │
│     1 event →     │
│     N workflows   │
└────────┬──────────┘
         │
         ▼ (for each matching workflow)
┌──────────────────┐
│  Kafka Topic      │
│  workflow.         │
│  execution.start  │
└──────────────────┘
```

---

## Webhook Management

### Endpoint Lifecycle

```sql
-- Each workflow with a webhook trigger gets a unique endpoint
INSERT INTO webhook_endpoints (tenant_id, workflow_id, endpoint_path, secret_hash, status)
VALUES (
  'tenant_abc',
  'wf_xyz',
  'hooks/ep_' || gen_random_uuid()::text,
  crypt(generate_secret(), gen_salt('bf')),
  'active'
);
```

### Signature Verification

Different integrations use different signing methods:

```typescript
function verifyWebhookSignature(
  integration: Integration,
  request: WebhookRequest,
  secret: string
): boolean {
  switch (integration.webhook_config.signing_method) {
    case 'hmac_sha256':
      const expected = crypto
        .createHmac('sha256', secret)
        .update(request.rawBody)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(request.headers['x-signature']),
        Buffer.from(expected)
      );

    case 'hmac_sha1':
      // GitHub-style
      const hash = crypto.createHmac('sha1', secret).update(request.rawBody).digest('hex');
      return request.headers['x-hub-signature'] === `sha1=${hash}`;

    case 'timestamp_signature':
      // Stripe-style (timestamp + payload signing)
      return verifyStripeSignature(request, secret);

    case 'none':
      return true; // Some integrations do not sign webhooks
  }
}
```

---

## Event Deduplication

### Problem

External services may deliver the same webhook multiple times (at-least-once delivery). Without deduplication, the same event could trigger a workflow multiple times.

### Solution: Redis-Based Dedup Window

```typescript
async function isDuplicate(eventFingerprint: string): Promise<boolean> {
  const key = `dedup:${eventFingerprint}`;
  const result = await redis.set(key, '1', 'NX', 'EX', 86400); // 24h window
  return result === null; // null means key already existed
}

function computeFingerprint(event: TriggerEvent): string {
  // Option 1: Use idempotency key from header
  if (event.headers['x-idempotency-key']) {
    return `idempotency:${event.headers['x-idempotency-key']}`;
  }

  // Option 2: Use integration-specific event ID
  if (event.payload.event_id) {
    return `event:${event.endpoint_id}:${event.payload.event_id}`;
  }

  // Option 3: Hash the payload
  return `hash:${event.endpoint_id}:${sha256(JSON.stringify(event.payload))}`;
}
```

---

## Fan-Out: One Event to Many Workflows

A single webhook endpoint can be shared by multiple workflows. When an event arrives:

```typescript
async function routeEvent(event: TriggerEvent): Promise<void> {
  // Find all active workflows that match this trigger
  const workflows = await findMatchingWorkflows(event);

  for (const workflow of workflows) {
    // Each workflow gets its own execution
    await kafka.produce('workflow.execution.start', {
      key: workflow.id,
      value: {
        execution_id: generateId(),
        workflow_id: workflow.id,
        workflow_version: workflow.version,
        trigger_data: event.payload,
        trigger_source: event.source_type,
        trigger_event_id: event.id,
      },
    });
  }
}
```

---

## Event Replay

### Use Cases

1. **Webhook received during outage**: Events are in Kafka but workers were down. On recovery, workers process the backlog automatically.
2. **Bug in workflow logic**: User fixes their workflow and wants to replay recent events through the new version.
3. **Integration failure**: External API was down, all executions failed. User wants to retry after the API recovers.

### Implementation

```
Manual replay via API:
POST /api/v1/events/:event_id/replay
  -- Re-produces the original event to Kafka
  -- New execution created with reference to original event

Bulk replay:
POST /api/v1/events/replay
Body: {
  "workflow_id": "wf_abc",
  "from": "2026-03-14T00:00:00Z",
  "to": "2026-03-15T00:00:00Z",
  "status_filter": "failed"
}
  -- Replays all failed events in the time range
```

---

## Scaling Considerations

| Concern                   | Strategy                                                    |
| ------------------------- | ----------------------------------------------------------- |
| Webhook burst (1000+ rps) | Trigger service scales via HPA; immediate Kafka offload     |
| Kafka consumer lag         | KEDA scales event router consumers                         |
| Dedup store size           | Redis with 24h TTL; sharded across cluster                 |
| Fan-out amplification      | Rate limit: max 50 workflows per webhook endpoint          |
| Large payloads             | Payloads > 256KB offloaded to S3; Kafka message has S3 ref |
| Polling at scale           | BullMQ rate limiter; max polls per minute per tenant       |

---

## Implementation Phases

### Phase 1 (MVP)
- API trigger only (POST /triggers/api/:workflow_id)
- Basic event routing (1 trigger -> 1 workflow)
- Idempotency key dedup

### Phase 2
- Webhook trigger endpoints
- Signature verification (HMAC-SHA256)
- Fan-out (1 event -> N workflows)
- Payload deduplication

### Phase 3
- Polling engine (BullMQ-based)
- App event triggers (managed webhook subscriptions)
- Event replay API
- Event history and search

### Phase 4
- Real-time event streaming (WebSocket to UI)
- Webhook endpoint analytics (delivery rate, latency)
- Advanced routing rules (content-based routing)
- Event transformation before workflow execution
