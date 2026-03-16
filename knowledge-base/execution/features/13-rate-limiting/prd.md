# Feature PRD: Rate Limiting & Throttling

## Problem Statement

River Flow interacts with external APIs that impose rate limits, serves multiple tenants with different plan tiers, and must protect itself from abuse and overload. A multi-layered rate limiting system ensures fair resource distribution, respects external API limits, and prevents any single tenant from degrading the platform for others.

---

## User Stories

1. **As a free user**, I want clear feedback when I hit my plan limits, with an option to upgrade.
2. **As an enterprise user**, I want my workflows to never be throttled by other tenants' activity.
3. **As a platform operator**, I want external API rate limits respected to avoid getting River Flow blocked by third-party services.
4. **As a user**, I want to see my current usage and remaining quota.

---

## Rate Limiting Layers

```
Layer 1: API Gateway (Kong)
  - Per-tenant request rate limiting
  - DDoS protection (global limits)
  - Webhook ingestion limits

Layer 2: Application (Services)
  - Per-tenant execution limits (tasks/month)
  - Per-tenant concurrent execution limits
  - Per-workflow trigger rate limiting

Layer 3: Integration (Workers)
  - Per-integration API rate limiting
  - Per-connection rate limiting
  - Adaptive throttling based on API response headers
```

---

## Layer 1: API Gateway Rate Limiting

### Implementation: Kong Rate Limiting Plugin + Redis

```yaml
Per-tenant limits (based on plan):
  free:
    requests_per_minute: 60
    requests_per_hour: 1000
    requests_per_day: 5000

  starter:
    requests_per_minute: 300
    requests_per_hour: 10000
    requests_per_day: 100000

  pro:
    requests_per_minute: 1000
    requests_per_hour: 50000
    requests_per_day: 500000

  enterprise:
    requests_per_minute: 5000
    requests_per_hour: 200000
    requests_per_day: 2000000

Global limits (DDoS protection):
  requests_per_second: 10000 (across all tenants)
```

### Rate Limit Headers

Every API response includes:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 876
X-RateLimit-Reset: 1710500400        (Unix timestamp)
X-RateLimit-Policy: "1000;w=60"      (1000 per 60 seconds)
Retry-After: 13                       (only on 429 responses)
```

---

## Layer 2: Application Rate Limiting

### Task Execution Limits

```
Plan-based monthly task limits:
  Free:       100 tasks/month
  Starter:    10,000 tasks/month
  Pro:        100,000 tasks/month
  Enterprise: Custom (1M+)

A "task" = one workflow execution (regardless of step count)
```

### Implementation: Redis + ClickHouse

```typescript
class TaskLimiter {
  async checkLimit(tenantId: string): Promise<LimitCheck> {
    const plan = await getPlanLimits(tenantId);
    const used = await getMonthlyUsage(tenantId);

    if (used >= plan.task_limit) {
      return {
        allowed: false,
        limit: plan.task_limit,
        used: used,
        remaining: 0,
        resets_at: getEndOfMonth(),
      };
    }

    return { allowed: true, remaining: plan.task_limit - used };
  }

  async recordUsage(tenantId: string): Promise<void> {
    // Increment Redis counter (fast path)
    const key = `usage:tasks:${tenantId}:${getCurrentMonth()}`;
    await redis.incr(key);
    await redis.expire(key, 35 * 86400); // 35 days TTL

    // Emit to Kafka for ClickHouse aggregation (accurate path)
    await kafka.produce('billing.usage.event', {
      tenant_id: tenantId,
      metric: 'task_execution',
      quantity: 1,
      timestamp: new Date(),
    });
  }
}
```

### Concurrent Execution Limits

```
Per-tenant concurrent executions:
  Free:       5
  Starter:    20
  Pro:        100
  Enterprise: 500+

Implementation: Redis sorted set
  Key: concurrent:executions:{tenant_id}
  Score: execution start timestamp
  Member: execution_id

  Before starting execution:
    1. Remove expired entries (older than 15 min timeout)
    2. Check ZCARD < limit
    3. If under limit: ZADD and proceed
    4. If at limit: queue execution (delayed start)
```

### Per-Workflow Trigger Rate Limiting

Prevent a single workflow from consuming all resources:

```
Default: 100 triggers per minute per workflow
Configurable per workflow (admin override for high-volume use cases)

Implementation: Token bucket per workflow_id in Redis
```

---

## Layer 3: Integration Rate Limiting

### Per-Integration Throttling

Each integration has known API rate limits:

```typescript
interface IntegrationRateLimit {
  integration_id: string;
  limits: {
    requests_per_second?: number;
    requests_per_minute?: number;
    requests_per_hour?: number;
    requests_per_day?: number;
    concurrent_requests?: number;
  };
  scope: 'per_connection' | 'per_tenant' | 'global';
}

// Examples:
const integrationLimits = {
  salesforce: { requests_per_second: 25, scope: 'per_connection' },
  hubspot:    { requests_per_second: 10, requests_per_day: 250000, scope: 'per_connection' },
  slack:      { requests_per_minute: 60, scope: 'per_connection' },
  stripe:     { requests_per_second: 100, scope: 'global' },
};
```

### Token Bucket Algorithm

```typescript
class TokenBucket {
  constructor(
    private key: string,
    private maxTokens: number,
    private refillRate: number,  // tokens per second
    private redis: Redis,
  ) {}

  async consume(tokens: number = 1): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const result = await this.redis.eval(TOKEN_BUCKET_SCRIPT, 1, this.key, [
      this.maxTokens.toString(),
      this.refillRate.toString(),
      now.toString(),
      tokens.toString(),
    ]);

    return {
      allowed: result[0] === 1,
      retryAfter: result[0] === 0 ? result[1] : undefined,
    };
  }
}

// Lua script for atomic token bucket operation
const TOKEN_BUCKET_SCRIPT = `
  local key = KEYS[1]
  local max_tokens = tonumber(ARGV[1])
  local refill_rate = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  local requested = tonumber(ARGV[4])

  local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
  local tokens = tonumber(bucket[1]) or max_tokens
  local last_refill = tonumber(bucket[2]) or now

  -- Refill tokens based on elapsed time
  local elapsed = (now - last_refill) / 1000
  tokens = math.min(max_tokens, tokens + (elapsed * refill_rate))

  if tokens >= requested then
    tokens = tokens - requested
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, 3600)
    return {1, 0}  -- allowed
  else
    local wait_ms = math.ceil((requested - tokens) / refill_rate * 1000)
    return {0, wait_ms}  -- denied, retry after wait_ms
  end
`;
```

### Adaptive Rate Limiting

Workers read rate limit headers from API responses and adjust dynamically:

```typescript
function updateRateLimitFromResponse(integration: string, response: Response): void {
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const resetAt = response.headers.get('X-RateLimit-Reset');

  if (remaining !== null && parseInt(remaining) < 10) {
    // Approaching limit: slow down proactively
    const slowdownFactor = Math.max(0.1, parseInt(remaining) / 100);
    rateLimiter.adjustRate(integration, slowdownFactor);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    rateLimiter.pause(integration, parseInt(retryAfter || '60') * 1000);
  }
}
```

---

## Usage Dashboard

### Current Usage View

```
┌─────────────────────────────────────────────────┐
│  Usage - March 2026                 Pro Plan     │
│                                                  │
│  Tasks Used: 42,387 / 100,000     ████████░░ 42%│
│  Resets: April 1, 2026                           │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ [Bar Chart: Daily task usage]            │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  API Calls Today: 2,341 / 50,000                 │
│  Concurrent Executions: 12 / 100                 │
│                                                  │
│  [Upgrade Plan] [View Usage History]             │
└─────────────────────────────────────────────────┘
```

### Usage Alerts

```
At 80% usage:
  Email: "You've used 80% of your monthly task limit"
  In-app banner: "80% of tasks used. Consider upgrading."

At 100% usage:
  Email: "You've reached your task limit. Workflows are paused."
  In-app modal: "Task limit reached. Upgrade to continue."
  Workflow behavior: New triggers are queued (not dropped)
                     Queued triggers execute when new billing period starts
                     Or immediately on plan upgrade
```

---

## API Design

```
GET /api/v1/usage
  Response: {
    "period": "2026-03",
    "tasks": { "used": 42387, "limit": 100000, "remaining": 57613 },
    "api_calls": { "used": 2341, "limit": 500000, "remaining": 497659 },
    "concurrent_executions": { "current": 12, "limit": 100 },
    "resets_at": "2026-04-01T00:00:00Z"
  }

GET /api/v1/usage/history
  Query: ?from=2026-01&to=2026-03&granularity=day
  Response: { timeseries: [{ date, tasks, api_calls }] }
```

---

## Implementation Phases

### Phase 1 (MVP)
- API gateway rate limiting (per-tenant, based on plan)
- Monthly task limit enforcement (Redis counter)
- 429 responses with Retry-After header
- Basic usage endpoint

### Phase 2
- Per-integration rate limiting (token bucket)
- Concurrent execution limits
- Usage dashboard UI
- Usage alerts (80%, 100%)

### Phase 3
- Adaptive rate limiting (read API response headers)
- Per-workflow trigger rate limiting
- Usage history and trends
- Graceful degradation (queue instead of drop at limit)

### Phase 4
- Enterprise custom limits
- Rate limit analytics (which integrations are bottlenecks)
- Burst allowance (short-term burst above limit, with throttle after)
- Cost-based metering (different task types cost differently)
