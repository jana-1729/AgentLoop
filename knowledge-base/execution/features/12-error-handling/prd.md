# Feature PRD: Error Handling & Resilience

## Problem Statement

Workflow automations interact with external systems that can fail at any time -- APIs go down, rate limits are hit, tokens expire, data is malformed. The error handling system must gracefully manage these failures through retries, circuit breakers, dead letter queues, error branching, and user notifications, ensuring no data is silently lost.

---

## User Stories

1. **As a user**, I want failed steps to automatically retry before marking the execution as failed.
2. **As a user**, I want to define an error handling path for a step (e.g., send a Slack alert if the Salesforce step fails).
3. **As a user**, I want to see failed executions and retry them with one click.
4. **As a user**, I want to be notified when a workflow fails repeatedly.
5. **As a platform operator**, I want a dead letter queue for events that could not be processed after all retries.

---

## Retry System

### Step-Level Retries

Each workflow step has a configurable retry policy:

```typescript
interface RetryConfig {
  max_retries: number;       // Default: 3
  backoff_type: 'exponential' | 'linear' | 'fixed';
  initial_delay_ms: number;  // Default: 5000 (5 seconds)
  max_delay_ms: number;      // Default: 300000 (5 minutes)
  multiplier: number;        // Default: 2 (for exponential)
  retryable_errors: string[]; // HTTP status codes or error codes to retry
}
```

### Default Retry Policy

```
Max retries: 3
Backoff: exponential
Delays: 5s → 10s → 20s

Retryable conditions (default):
  - HTTP 408 (Request Timeout)
  - HTTP 429 (Rate Limited)
  - HTTP 500 (Internal Server Error)
  - HTTP 502 (Bad Gateway)
  - HTTP 503 (Service Unavailable)
  - HTTP 504 (Gateway Timeout)
  - Network errors (ECONNRESET, ETIMEDOUT, ECONNREFUSED)
  - Token refresh needed (automatic 401 recovery)

Non-retryable conditions:
  - HTTP 400 (Bad Request) -- data issue, retry won't help
  - HTTP 401 after token refresh attempt -- auth permanently broken
  - HTTP 403 (Forbidden) -- permission issue
  - HTTP 404 (Not Found) -- resource doesn't exist
  - HTTP 422 (Unprocessable Entity) -- validation error
```

### Retry Execution Flow

```
Step fails
  │
  ▼
Is error retryable?
  │
  ├── NO → Mark step FAILED, enter error handling
  │
  └── YES → Check retry count
         │
         ├── Retries remaining
         │     │
         │     ▼
         │   Calculate backoff delay
         │     │
         │     ▼
         │   Re-queue step to Kafka with delay header
         │     │
         │     ▼
         │   Worker picks up after delay, retries step
         │
         └── Retries exhausted
               │
               ▼
             Mark step FAILED, enter error handling
```

### Backoff Calculation

```typescript
function calculateBackoff(config: RetryConfig, attemptNumber: number): number {
  let delay: number;

  switch (config.backoff_type) {
    case 'exponential':
      delay = config.initial_delay_ms * Math.pow(config.multiplier, attemptNumber);
      break;
    case 'linear':
      delay = config.initial_delay_ms * (attemptNumber + 1);
      break;
    case 'fixed':
      delay = config.initial_delay_ms;
      break;
  }

  // Add jitter (0-25% random variance) to prevent thundering herd
  const jitter = delay * Math.random() * 0.25;
  delay = Math.min(delay + jitter, config.max_delay_ms);

  return Math.round(delay);
}
```

---

## Error Branching

Users can define error handling paths in the workflow builder:

```
Normal flow:
  Trigger → Step 1 → Step 2 → Step 3

With error branch:
  Trigger → Step 1 → Step 2 ─── (success) ──→ Step 3
                        │
                        └──── (error) ──→ Error Step: Send Slack Alert
                                          Error Step: Log to Google Sheet
```

### Configuration

```typescript
interface StepErrorConfig {
  retry: RetryConfig;
  on_error: 'fail' | 'continue' | 'branch';
  error_branch_steps?: string[];  // Step IDs to execute on failure
  continue_with_default?: any;    // Default value if step fails and on_error = 'continue'
}
```

### Error Actions

| Action       | Behavior                                                      |
| ------------ | ------------------------------------------------------------- |
| `fail`       | Stop execution, mark as failed (default)                      |
| `continue`   | Log error, use default/null output, continue to next step     |
| `branch`     | Execute error branch steps, then continue or fail             |

---

## Circuit Breaker

### Per-Integration Circuit Breaker

Protects against cascading failures when an external API is down:

```typescript
interface CircuitBreakerConfig {
  failure_threshold: number;    // Consecutive failures to open circuit (default: 5)
  reset_timeout_ms: number;     // Time in OPEN state before trying again (default: 60000)
  half_open_requests: number;   // Requests to allow in HALF_OPEN (default: 2)
  monitoring_window_ms: number; // Time window for counting failures (default: 120000)
}
```

### States

```
CLOSED (normal operation)
  │
  │ 5 consecutive failures
  ▼
OPEN (all requests fail immediately)
  │
  │ After 60 seconds
  ▼
HALF_OPEN (allow 2 test requests)
  │
  ├── Both succeed → CLOSED
  └── Any fails    → OPEN (restart timer)
```

### Implementation

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failures = 0;
  private lastFailure: Date | null = null;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure!.getTime() > this.config.reset_timeout_ms) {
        this.state = 'half_open';
      } else {
        throw new CircuitOpenError(this.integration);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

### Circuit Breaker Scope

```
Per-integration, per-tenant:
  Key: circuit:salesforce:tenant_abc
  Stored in: Redis (shared across all workers)

When circuit is OPEN for an integration:
  - All workflow steps targeting that integration pause (not fail)
  - Paused executions resume automatically when circuit closes
  - User notification: "Salesforce API is currently unavailable. Your workflows will resume automatically."
```

---

## Dead Letter Queue (DLQ)

### What Goes to DLQ

Events that could not be processed after all retries:

```
Kafka consumer retry exhausted → Produce to {topic}.dlt

DLQ message includes:
  - Original event payload
  - Error message and stack trace
  - Number of retry attempts
  - Original topic and partition
  - Timestamp of first attempt and last attempt
  - Tenant ID (for routing)
```

### DLQ Processing

```
Admin API:
  GET    /admin/dlq/messages?topic=workflow.execution.start.dlt&limit=20
  GET    /admin/dlq/messages/:id
  POST   /admin/dlq/messages/:id/retry      -- Re-publish to original topic
  POST   /admin/dlq/messages/retry-batch     -- Retry all messages matching filter
  DELETE /admin/dlq/messages/:id             -- Acknowledge and discard

Auto-cleanup:
  DLQ messages older than 30 days are archived to S3 and removed from Kafka
```

---

## User-Facing Error Experience

### Execution Failure UI

```
┌─────────────────────────────────────────────────────┐
│  Execution #846 - FAILED                             │
│                                                      │
│  Step 2: Create Salesforce Contact                   │
│  Error: 401 Unauthorized - INVALID_SESSION_ID        │
│                                                      │
│  Retry History:                                      │
│  Attempt 1: Failed (401) at 10:25:00               │
│  Attempt 2: Failed (401) at 10:25:05  (+5s)        │
│  Attempt 3: Failed (401) at 10:25:15  (+10s)       │
│  Attempt 4: Failed (401) at 10:25:35  (+20s)       │
│  All retries exhausted                               │
│                                                      │
│  [Retry Now] [Re-connect Salesforce] [View Workflow] │
└─────────────────────────────────────────────────────┘
```

### Error Notifications

```
Alert: Your workflow "Lead Sync" has failed 3 times in a row.

Details:
  Step: Create Salesforce Contact
  Error: 401 Unauthorized
  Last failure: 2 minutes ago

Actions:
  - View execution details: https://app.riverflow.io/executions/exec_846
  - Re-connect Salesforce: https://app.riverflow.io/connections

This alert will be muted for 30 minutes (cooldown period).
```

---

## Bulk Retry

```
POST /api/v1/executions/retry-batch
Body: {
  "workflow_id": "wf_abc",
  "status": "failed",
  "from": "2026-03-14T00:00:00Z",
  "to": "2026-03-15T00:00:00Z"
}
Response: { "retried": 47, "skipped": 3 }
```

Skipped reasons: execution already succeeded on subsequent trigger, workflow deactivated.

---

## Implementation Phases

### Phase 1 (MVP)
- Step-level retries with exponential backoff
- Default retry policy (3 retries, 5s/10s/20s)
- Execution status: failed with error message
- Manual retry via UI

### Phase 2
- Configurable retry policies per step
- Error branch (on_error: branch)
- Continue on error (on_error: continue)
- DLQ for unprocessable Kafka messages

### Phase 3
- Circuit breaker per integration
- Execution pause/resume when integration is down
- Bulk retry API
- Error notifications (email + Slack)

### Phase 4
- AI-powered error diagnosis
- Auto-recovery suggestions
- Error pattern analysis (detect systemic issues)
- Custom retry strategies (per-integration rate limit awareness)
