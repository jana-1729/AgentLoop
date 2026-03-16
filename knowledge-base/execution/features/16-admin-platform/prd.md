# Feature PRD: Admin Platform

## Problem Statement

Platform operators need internal tools to manage tenants, monitor system health, review community connectors, handle support escalations, manage feature flags, and intervene in failure scenarios. The admin platform provides a secure internal dashboard and APIs that are not exposed to end users.

---

## User Stories

1. **As a platform operator**, I want a dashboard showing system-wide health: execution throughput, error rates, queue depths.
2. **As a support engineer**, I want to look up a tenant's account, view their workflows, and debug their failed executions.
3. **As an admin**, I want to manage feature flags to gradually roll out new capabilities.
4. **As an admin**, I want to review and approve community connectors before they go live in the marketplace.
5. **As an admin**, I want to manually retry failed executions or flush stuck queues.

---

## Architecture

```
Admin Frontend (React app, separate from main app)
        │
        ▼
Kong API Gateway (admin routes)
  - Requires: JWT + admin role
  - IP allowlist: office IPs only
        │
        ▼
Admin Service (NestJS)
  - Connects to: PostgreSQL, Redis, OpenSearch, ClickHouse, Kafka
  - Restricted access via Istio AuthorizationPolicy
```

The admin platform is a separate Next.js application deployed at `admin.riverflow.io` (or behind VPN). Access requires:
- River Flow user account with `admin` platform role (not tenant admin)
- IP allowlist enforcement
- 2FA mandatory

---

## Dashboard Modules

### 1. System Health Dashboard

```
┌─────────────────────────────────────────────────┐
│  System Health                   [Last 1 hour]   │
│                                                  │
│  Executions/min: 8,432    ▲ 12% vs last hour    │
│  Success Rate:   99.2%    ▼ 0.3% vs last hour   │
│  Avg Latency:    1.8s     ▲ 0.2s vs last hour   │
│  Active Workers: 47/100                          │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ [Line Chart: Executions over time]       │    │
│  │ Success ─── Failed - - - Timeout ...     │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Queue Depths:                                   │
│  workflow.execution.start:  lag 23    ✓          │
│  workflow.execution.step:   lag 156   ⚠          │
│  trigger.webhook.received:  lag 0     ✓          │
│  DLQ total messages:        12        ⚠          │
│                                                  │
│  Services:                                       │
│  auth-service:        3/3 pods healthy ✓         │
│  workflow-service:    5/5 pods healthy ✓         │
│  execution-worker:    47/47 pods      ✓         │
│  trigger-service:     8/8 pods healthy ✓         │
│  scheduler-service:   3/3 pods healthy ✓         │
│  billing-service:     2/2 pods healthy ✓         │
│                                                  │
│  Infrastructure:                                 │
│  PostgreSQL:  CPU 23%, Connections 142/5000  ✓   │
│  Redis:       Memory 2.1GB/8GB, Hit rate 94% ✓  │
│  Kafka:       Throughput 12K msg/s           ✓   │
│  OpenSearch:  Storage 234GB/1.5TB            ✓   │
└─────────────────────────────────────────────────┘
```

### 2. Tenant Management

```
┌─────────────────────────────────────────────────┐
│  Tenants                    [Search: ________]   │
│                                                  │
│  Total: 12,847  Active: 11,923  Trial: 924      │
│                                                  │
│  ┌────────┬──────────┬──────┬──────┬──────────┐ │
│  │ Name   │ Plan     │ Tasks│ Users│ Status   │ │
│  ├────────┼──────────┼──────┼──────┼──────────┤ │
│  │ Acme   │ Pro      │ 45K  │ 8    │ Active   │ │
│  │ BetaCo │ Starter  │ 3.2K │ 3    │ Active   │ │
│  │ Gamma  │ Free     │ 89   │ 1    │ Active   │ │
│  │ Delta  │ Team     │ 0    │ 12   │ Suspended│ │
│  └────────┴──────────┴──────┴──────┴──────────┘ │
│                                                  │
│  [Click tenant for detail view]                  │
└─────────────────────────────────────────────────┘
```

### Tenant Detail View

```
┌─────────────────────────────────────────────────┐
│  Tenant: Acme Corp                               │
│  ID: tenant_abc123                               │
│  Plan: Pro ($99/month)                           │
│  Created: 2026-01-15                             │
│  Status: Active                                  │
│                                                  │
│  Usage This Month:                               │
│  Tasks: 45,231 / 100,000                         │
│  Workflows: 23 (18 active)                       │
│  Connections: 8                                  │
│  Team Members: 8                                 │
│                                                  │
│  Recent Executions:                              │
│  [Execution list with status, duration]          │
│                                                  │
│  Actions:                                        │
│  [Suspend Tenant] [Upgrade Plan] [Reset Limits]  │
│  [Impersonate User] [View Audit Logs]            │
│  [Send Notification] [Export Data]               │
└─────────────────────────────────────────────────┘
```

---

### 3. DLQ Management

```
┌─────────────────────────────────────────────────┐
│  Dead Letter Queue                               │
│                                                  │
│  Total Messages: 47                              │
│  Oldest: 2 hours ago                             │
│                                                  │
│  By Topic:                                       │
│  workflow.execution.start.dlt:  23 messages      │
│  workflow.execution.step.dlt:   18 messages      │
│  trigger.webhook.received.dlt:  6 messages       │
│                                                  │
│  [Select topic to view messages]                 │
│                                                  │
│  Message Detail:                                 │
│  ID: msg_abc123                                  │
│  Original Topic: workflow.execution.start        │
│  Tenant: Acme Corp                               │
│  Error: "Connection timed out after 60s"         │
│  Retries: 3                                      │
│  First Attempt: 2 hours ago                      │
│  Last Attempt: 1 hour ago                        │
│                                                  │
│  [Retry] [Retry All for Topic] [Discard] [View]  │
└─────────────────────────────────────────────────┘
```

---

### 4. Feature Flag Management

```
┌─────────────────────────────────────────────────┐
│  Feature Flags                                   │
│                                                  │
│  ┌─────────────────┬────────┬──────────────────┐│
│  │ Flag            │ Status │ Targeting         ││
│  ├─────────────────┼────────┼──────────────────┤│
│  │ ai_workflow_gen │ 30%    │ Pro+ plans only  ││
│  │ code_steps_py   │ ON     │ All tenants      ││
│  │ new_dashboard   │ OFF    │ --               ││
│  │ v2_api          │ 10%    │ API key users    ││
│  │ parallel_exec   │ ON     │ Enterprise only  ││
│  └─────────────────┴────────┴──────────────────┘│
│                                                  │
│  [Create Flag]                                   │
└─────────────────────────────────────────────────┘
```

### Feature Flag Data Model

```typescript
interface FeatureFlag {
  id: string;
  key: string;                    // "ai_workflow_gen"
  description: string;
  status: 'on' | 'off' | 'percentage';
  percentage?: number;            // 0-100 for gradual rollout
  targeting: {
    plans?: string[];             // Only these plans
    tenants?: string[];           // Only these tenant IDs
    users?: string[];             // Only these user IDs
  };
  created_at: Date;
  updated_at: Date;
}
```

### Feature Flag Evaluation

```typescript
async function isFeatureEnabled(flagKey: string, context: FlagContext): Promise<boolean> {
  const flag = await redis.hgetall(`feature-flag:${flagKey}`);
  if (!flag) return false;

  if (flag.status === 'off') return false;
  if (flag.status === 'on') {
    // Check targeting
    if (flag.targeting?.plans && !flag.targeting.plans.includes(context.plan)) return false;
    if (flag.targeting?.tenants && !flag.targeting.tenants.includes(context.tenant_id)) return false;
    return true;
  }

  if (flag.status === 'percentage') {
    // Deterministic percentage based on tenant_id hash
    const hash = murmurhash(context.tenant_id);
    return (hash % 100) < flag.percentage;
  }

  return false;
}
```

---

### 5. Connector Review Queue

```
┌─────────────────────────────────────────────────┐
│  Connector Review Queue                          │
│                                                  │
│  Pending: 3 connectors                           │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ Notion Connector v2.1.0                     │ │
│  │ Author: john@dev.com (verified)             │ │
│  │ Submitted: 2 days ago                       │ │
│  │ Changes: Added "Create Database" action     │ │
│  │                                             │ │
│  │ Automated Checks:                           │ │
│  │ ✓ Schema validation passed                  │ │
│  │ ✓ Auth flow tested                          │ │
│  │ ✓ No security issues found                  │ │
│  │ ⚠ Rate limit config: 3 req/s (verify)      │ │
│  │                                             │ │
│  │ [Approve] [Request Changes] [Reject]        │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Admin API

```
Tenants:
  GET    /admin/api/v1/tenants                    -- List all tenants
  GET    /admin/api/v1/tenants/:id                -- Tenant detail
  PATCH  /admin/api/v1/tenants/:id                -- Update (suspend, upgrade)
  POST   /admin/api/v1/tenants/:id/impersonate    -- Get impersonation token
  GET    /admin/api/v1/tenants/:id/usage          -- Detailed usage
  GET    /admin/api/v1/tenants/:id/executions     -- Tenant's executions
  GET    /admin/api/v1/tenants/:id/audit-logs     -- Tenant's audit trail

System:
  GET    /admin/api/v1/system/health              -- System health metrics
  GET    /admin/api/v1/system/metrics             -- Prometheus metrics
  GET    /admin/api/v1/system/services            -- Service status

DLQ:
  GET    /admin/api/v1/dlq/messages               -- List DLQ messages
  GET    /admin/api/v1/dlq/messages/:id           -- DLQ message detail
  POST   /admin/api/v1/dlq/messages/:id/retry     -- Retry single
  POST   /admin/api/v1/dlq/messages/retry-batch   -- Retry batch
  DELETE /admin/api/v1/dlq/messages/:id           -- Discard

Feature Flags:
  GET    /admin/api/v1/feature-flags              -- List flags
  POST   /admin/api/v1/feature-flags              -- Create flag
  PATCH  /admin/api/v1/feature-flags/:id          -- Update flag
  DELETE /admin/api/v1/feature-flags/:id          -- Delete flag

Connectors:
  GET    /admin/api/v1/connectors/pending         -- Review queue
  POST   /admin/api/v1/connectors/:id/approve     -- Approve
  POST   /admin/api/v1/connectors/:id/reject      -- Reject with reason

Operations:
  POST   /admin/api/v1/executions/:id/retry       -- Force retry execution
  POST   /admin/api/v1/cache/flush                -- Flush specific cache
  POST   /admin/api/v1/system/maintenance         -- Toggle maintenance mode
```

---

## Security

### Access Control

```
Admin platform access requires ALL of:
  1. User account with platform_role = 'platform_admin'
  2. Active 2FA on the account
  3. Request from allowed IP range (office VPN)
  4. Valid JWT with admin claims

Admin actions are audited:
  - Every admin API call logged to platform.audit.log
  - Impersonation sessions logged with admin_user_id
  - Destructive actions require confirmation token
```

### Impersonation

```
Admin can temporarily view the platform as a specific tenant user:

POST /admin/api/v1/tenants/:id/impersonate
Response: { impersonation_token, expires_in: 3600 }

The impersonation token:
  - Grants read-only access to the tenant's data
  - All actions logged with admin_id as actor
  - Cannot modify data (read-only by default)
  - Expires in 1 hour
  - Clearly indicated in UI: "Viewing as Acme Corp (admin impersonation)"
```

---

## Implementation Phases

### Phase 1 (MVP)
- Basic tenant list and detail view
- System health dashboard (Grafana embedded or custom)
- Manual execution retry
- Simple feature flag (on/off per tenant)

### Phase 2
- DLQ management UI
- Feature flag management with percentage rollout
- Tenant suspension and plan management
- Admin audit logging

### Phase 3
- Connector review queue
- Impersonation capability
- Advanced system metrics dashboard
- Maintenance mode toggle

### Phase 4
- Internal analytics (tenant growth, revenue, churn)
- Automated alerting for unhealthy tenants
- Bulk operations (mass tenant notification, mass retry)
- Admin mobile app (critical alerts only)
