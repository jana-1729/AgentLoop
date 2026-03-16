# Microservices Catalog -- River Flow

## Overview

River Flow consists of 12 independently deployable microservices organized into four domains: Identity, Automation, Integration, and Platform. Each service owns its domain data and communicates via REST (external), gRPC (internal synchronous), and Kafka (asynchronous events).

---

## Service Map

```
┌─────────────────────────────────────────────────────────────────┐
│                      IDENTITY DOMAIN                            │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐       │
│   │   Auth      │  │   Tenant    │  │  Team & Org     │       │
│   │   Service   │  │   Service   │  │   Service       │       │
│   └─────────────┘  └─────────────┘  └─────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                     AUTOMATION DOMAIN                            │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐       │
│   │  Workflow   │  │  Trigger    │  │  Scheduler      │       │
│   │  Service    │  │  Service    │  │   Service       │       │
│   └─────────────┘  └─────────────┘  └─────────────────┘       │
│                                                                 │
│   ┌─────────────────────────┐                                   │
│   │   Execution Worker      │                                   │
│   │   (Kafka Consumer Pool) │                                   │
│   └─────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRATION DOMAIN                            │
│                                                                 │
│   ┌─────────────────────┐  ┌────────────────────────┐          │
│   │  Integration        │  │  Connection            │          │
│   │  Service            │  │  Service               │          │
│   └─────────────────────┘  └────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                     PLATFORM DOMAIN                              │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐       │
│   │  Billing    │  │  Logging    │  │  Admin           │       │
│   │  Service    │  │  Service    │  │  Service         │       │
│   └─────────────┘  └─────────────┘  └─────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service Details

### 1. Auth Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/auth-service`                           |
| Port           | 3001                                          |
| Dependencies   | PostgreSQL, Redis, Vault                      |
| Scaling        | HPA (CPU 70%, 3-10 replicas)                  |
| Namespace      | `river-flow-gateway`                          |

**Responsibilities:**
- JWT token issuance and validation
- OAuth2 login flows (Google, GitHub, SAML/SSO)
- API key authentication for tenant machine-to-machine access
- Session management (Redis-backed)
- Password hashing (bcrypt) and reset flows
- RBAC permission resolution

**Key APIs:**
```
POST   /auth/login              -- Email/password login
POST   /auth/oauth/callback     -- OAuth2 callback
POST   /auth/token/refresh      -- Refresh JWT
POST   /auth/api-keys           -- Create API key
DELETE /auth/api-keys/:id       -- Revoke API key
GET    /auth/permissions        -- Get current user permissions
```

**Kafka Events Produced:**
- `identity.user.logged_in`
- `identity.api_key.created`

---

### 2. Tenant Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/tenant-service`                         |
| Port           | 3002                                          |
| Dependencies   | PostgreSQL, Redis                             |
| Scaling        | HPA (CPU 70%, 3-8 replicas)                   |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Tenant CRUD (create org, update plan, deactivate)
- Tenant settings and preferences
- Plan limit enforcement
- Feature flag resolution per tenant
- Onboarding flow state machine

**Key APIs:**
```
POST   /tenants                -- Create tenant (signup)
GET    /tenants/:id            -- Get tenant details
PATCH  /tenants/:id            -- Update tenant
GET    /tenants/:id/usage      -- Current usage summary
GET    /tenants/:id/limits     -- Plan limits
```

**Kafka Events Produced:**
- `identity.tenant.created`
- `identity.tenant.plan_changed`

---

### 3. Team & Org Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/tenant-service` (sub-module)            |
| Port           | 3002 (shared with tenant service)             |
| Dependencies   | PostgreSQL                                    |
| Scaling        | Shared with tenant service                    |

**Responsibilities:**
- User invitation and onboarding
- Team creation and membership
- Role assignment (admin, developer, viewer)
- Workspace management (folders for workflows)

**Key APIs:**
```
POST   /teams                        -- Create team
POST   /teams/:id/members            -- Add member
PATCH  /teams/:id/members/:userId    -- Change role
POST   /invitations                  -- Send invite
GET    /users/me                     -- Current user profile
```

---

### 4. Workflow Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/workflow-service`                       |
| Port           | 3003                                          |
| Dependencies   | PostgreSQL, Redis, Kafka                      |
| Scaling        | HPA (CPU 70%, 3-15 replicas)                  |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Workflow CRUD (create, update, clone, delete, archive)
- Workflow step management (add, reorder, configure)
- Workflow versioning (publish new versions, rollback)
- Workflow validation (check all steps configured correctly)
- Workflow activation/deactivation
- Template instantiation

**Key APIs:**
```
POST   /workflows                      -- Create workflow
GET    /workflows                      -- List workflows (filtered)
GET    /workflows/:id                  -- Get workflow with steps
PATCH  /workflows/:id                  -- Update workflow
POST   /workflows/:id/publish          -- Publish new version
POST   /workflows/:id/activate         -- Activate workflow
POST   /workflows/:id/test             -- Test run with sample data
DELETE /workflows/:id                  -- Soft delete
GET    /workflows/:id/versions         -- Version history
POST   /workflows/:id/clone            -- Clone workflow
```

**gRPC (Internal):**
```protobuf
service WorkflowService {
  rpc GetWorkflowDefinition(WorkflowRequest) returns (WorkflowDefinition);
  rpc GetWorkflowVersion(VersionRequest) returns (WorkflowDefinition);
}
```

**Kafka Events Produced:**
- `workflow.definition.created`
- `workflow.definition.published`
- `workflow.definition.activated`

---

### 5. Trigger Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/trigger-service`                        |
| Port           | 3004                                          |
| Dependencies   | PostgreSQL, Redis, Kafka                      |
| Scaling        | HPA (RPS-based, 5-30 replicas)               |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Webhook endpoint management (create, validate, route)
- Webhook payload ingestion and validation
- Event deduplication (idempotency keys in Redis)
- Polling engine for integrations without webhooks
- Fan-out: one trigger can start multiple workflows
- Webhook signature verification

**Key APIs:**
```
POST   /hooks/:endpoint_id           -- Receive webhook (public, no auth)
POST   /triggers/api/:workflow_id    -- API trigger (authenticated)
GET    /triggers/webhooks             -- List webhook endpoints
POST   /triggers/webhooks             -- Create webhook endpoint
```

**Kafka Events Produced:**
- `trigger.webhook.received`
- `trigger.api.received`
- `trigger.poll.data_found`
- `workflow.execution.start`

---

### 6. Scheduler Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/scheduler-service`                      |
| Port           | 3005                                          |
| Dependencies   | PostgreSQL, Redis (BullMQ)                    |
| Scaling        | Single leader + 2 standby (leader election)   |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Manage schedule definitions (CRUD)
- Evaluate cron expressions with timezone support
- Fire scheduled triggers at the correct time
- Handle missed schedules (catch-up logic)
- Distributed locking to prevent duplicate fires

**Key APIs:**
```
POST   /schedules                    -- Create schedule
GET    /schedules                    -- List schedules
PATCH  /schedules/:id               -- Update schedule
DELETE /schedules/:id               -- Delete schedule
GET    /schedules/:id/history       -- Past trigger times
```

**BullMQ Queues:**
- `schedule-evaluator` (repeating job, runs every 30 seconds)
- `schedule-trigger-fire` (fires individual scheduled workflows)

---

### 7. Execution Worker

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/execution-worker`                       |
| Port           | N/A (Kafka consumer, no HTTP)                 |
| Dependencies   | Kafka, PostgreSQL, Redis, S3, Vault, OpenSearch |
| Scaling        | KEDA (Kafka lag, 5-100 replicas)              |
| Namespace      | `river-flow-execution`                        |

**Responsibilities:**
- Consume workflow execution events from Kafka
- Orchestrate step-by-step execution
- Call external integration APIs (via connection service)
- Execute code steps in sandboxed environment
- Apply data transformations and field mappings
- Handle retries, timeouts, and error branches
- Persist step results to PostgreSQL
- Emit completion/failure events

**Kafka Topics Consumed:**
- `workflow.execution.start`
- `workflow.execution.step`

**Kafka Events Produced:**
- `workflow.execution.step_completed`
- `workflow.execution.completed`
- `workflow.execution.failed`
- `billing.usage.event`

---

### 8. Integration Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/integration-service`                    |
| Port           | 3006                                          |
| Dependencies   | PostgreSQL, S3                                |
| Scaling        | HPA (CPU 70%, 3-8 replicas)                   |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Integration catalog management (CRUD)
- Connector SDK package management (upload, version, validate)
- Integration schema definitions (triggers, actions, auth)
- Integration search and discovery
- Tenant integration subscription management

**Key APIs:**
```
GET    /integrations                    -- List/search integrations
GET    /integrations/:id               -- Get integration details
GET    /integrations/:id/triggers      -- Available triggers
GET    /integrations/:id/actions       -- Available actions
POST   /tenant-integrations            -- Subscribe to integration
DELETE /tenant-integrations/:id        -- Unsubscribe
```

---

### 9. Connection Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/integration-service` (sub-module)       |
| Port           | 3006 (shared)                                 |
| Dependencies   | PostgreSQL, Redis, Vault                      |
| Scaling        | Shared with integration service               |

**Responsibilities:**
- OAuth2 authorization flow management
- API key credential storage (in Vault)
- Token refresh and rotation
- Connection health validation
- 401 recovery (automatic re-auth)

**Key APIs:**
```
POST   /connections                     -- Create connection (start OAuth)
GET    /connections                     -- List connections
GET    /connections/:id/test           -- Validate connection
DELETE /connections/:id                -- Disconnect
GET    /oauth/callback                 -- OAuth2 redirect handler
```

**gRPC (Internal):**
```protobuf
service ConnectionService {
  rpc GetCredentials(ConnectionRequest) returns (Credentials);
  rpc RefreshToken(ConnectionRequest) returns (Credentials);
}
```

---

### 10. Billing Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/billing-service`                        |
| Port           | 3007                                          |
| Dependencies   | PostgreSQL, Kafka, ClickHouse, Stripe API     |
| Scaling        | HPA (CPU 70%, 2-5 replicas)                   |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Usage metering (consume execution events, aggregate)
- Plan management (tiers, limits, features)
- Stripe integration (subscriptions, invoices, payments)
- Overage handling and alerting
- Usage dashboard data

**Kafka Topics Consumed:**
- `billing.usage.event`

**Key APIs:**
```
GET    /billing/usage                  -- Current period usage
GET    /billing/invoices               -- Invoice history
POST   /billing/subscribe             -- Subscribe to plan
POST   /billing/portal                -- Stripe customer portal URL
```

---

### 11. Logging Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/logging-service`                        |
| Port           | 3008                                          |
| Dependencies   | OpenSearch, Kafka, S3                         |
| Scaling        | HPA (CPU 70%, 3-10 replicas)                  |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Consume execution events and persist to OpenSearch
- Execution log search and filtering
- Log retention management (ISM policies)
- Large payload offload to S3

**Kafka Topics Consumed:**
- `workflow.execution.completed`
- `workflow.execution.failed`
- `workflow.execution.step_completed`

**Key APIs:**
```
GET    /logs/executions                 -- Search execution logs
GET    /logs/executions/:id            -- Get execution detail
GET    /logs/executions/:id/steps      -- Get step-by-step log
GET    /logs/executions/:id/payload    -- Download full payload from S3
```

---

### 12. Admin Service

| Property       | Value                                         |
| -------------- | --------------------------------------------- |
| Package        | `apps/admin-service`                          |
| Port           | 3009                                          |
| Dependencies   | PostgreSQL, Redis, OpenSearch, ClickHouse     |
| Scaling        | HPA (CPU 70%, 2-3 replicas)                   |
| Namespace      | `river-flow-services`                         |

**Responsibilities:**
- Internal admin dashboard APIs
- Tenant management (view, suspend, upgrade)
- Connector management (approve, publish, deprecate)
- System health overview
- Feature flag management
- Manual intervention tools (retry failed executions, flush queues)

**Key APIs:**
```
GET    /admin/tenants                  -- List all tenants
PATCH  /admin/tenants/:id             -- Manage tenant (suspend, upgrade)
GET    /admin/system/health           -- System health dashboard
POST   /admin/executions/:id/retry    -- Manually retry execution
GET    /admin/connectors/pending      -- Connectors awaiting review
POST   /admin/feature-flags           -- Set feature flag
```

---

## Service Dependencies Matrix

```
                Auth  Tenant  Workflow  Trigger  Scheduler  Worker  Integration  Connection  Billing  Logging  Admin
Auth             -     R       -        -        -          -       -            -           -        -        -
Tenant           G     -       -        -        -          -       -            -           R        -        -
Workflow         G     G       -        R        R          -       G            G           -        -        -
Trigger          G     -       G        -        -          -       -            -           -        -        -
Scheduler        G     -       G        K        -          -       -            -           -        -        -
Worker           -     -       G        -        -          -       -            G           K        K        -
Integration      G     G       -        -        -          -       -            -           -        -        -
Connection       G     -       -        -        -          -       R            -           -        -        -
Billing          G     G       -        -        -          -       -            -           -        -        -
Logging          -     -       -        -        -          -       -            -           -        -        -
Admin            G     R       R        -        -          -       R            R           R        R        -

Legend: G = gRPC, R = REST, K = Kafka, - = No dependency
```

---

## Shared Libraries

All services import from shared packages in the monorepo:

| Package              | Contents                                              |
| -------------------- | ----------------------------------------------------- |
| `@river-flow/shared` | TypeScript types, DTOs, constants, error codes        |
| `@river-flow/database`| Prisma client, migrations, seed scripts             |
| `@river-flow/kafka-client` | Kafka producer/consumer wrappers, serialization |
| `@river-flow/queue-client` | BullMQ queue definitions, job types              |
| `@river-flow/connector-sdk` | SDK for building integration connectors         |
| `@river-flow/logger` | Structured JSON logger with trace context injection   |
