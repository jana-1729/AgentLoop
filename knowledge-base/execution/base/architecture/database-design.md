# Database Design -- River Flow

## Overview

PostgreSQL (Aurora) is the primary relational store for all domain data. The schema follows a normalized design with tenant isolation enforced by Row-Level Security. High-volume tables (executions, logs) are partitioned by time. Read replicas serve dashboard and analytics queries.

---

## Schema Strategy

### Single Database, Shared Schema with RLS

All tenants share the same tables. Every table has a `tenant_id` column with an RLS policy enforcing isolation at the database level.

```sql
-- Enable RLS on every domain table
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON workflows
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Application connection flow:
```
1. Request arrives with authenticated tenant_id
2. Service opens DB transaction
3. SET LOCAL app.current_tenant_id = '<tenant-id>';
4. All queries automatically filtered by RLS
5. Transaction commits
```

---

## Core Entity Schema

### Identity Domain

```sql
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  plan          VARCHAR(50) NOT NULL DEFAULT 'free',
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_credentials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  client_id     VARCHAR(64) UNIQUE NOT NULL,
  client_secret_hash VARCHAR(255) NOT NULL,
  label         VARCHAR(100),
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_creds_client_id ON tenant_credentials(client_id);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  name          VARCHAR(255),
  role          VARCHAR(50) NOT NULL DEFAULT 'member',
  auth_provider VARCHAR(50) DEFAULT 'email',
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

CREATE TABLE teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id       UUID NOT NULL REFERENCES teams(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  role          VARCHAR(50) NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, user_id)
);
```

### Integration Domain

```sql
CREATE TABLE integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  description     TEXT,
  icon_url        VARCHAR(500),
  auth_type       VARCHAR(50) NOT NULL,  -- oauth2, api_key, basic, custom
  auth_config     JSONB NOT NULL DEFAULT '{}',
  base_url        VARCHAR(500),
  supports_webhook BOOLEAN DEFAULT false,
  supports_polling BOOLEAN DEFAULT false,
  category        VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  config_schema   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  integration_id  UUID NOT NULL REFERENCES integrations(id),
  config          JSONB DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  enabled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, integration_id)
);

CREATE TABLE connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  integration_id  UUID NOT NULL REFERENCES integrations(id),
  user_id         UUID REFERENCES users(id),
  name            VARCHAR(255) NOT NULL,
  auth_data_ref   VARCHAR(255) NOT NULL,  -- Vault path, never stores credentials directly
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_connections_tenant ON connections(tenant_id);
CREATE INDEX idx_connections_integration ON connections(tenant_id, integration_id);
```

### Workflow Domain

```sql
CREATE TABLE workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  trigger_type    VARCHAR(50) NOT NULL,  -- webhook, schedule, api, polling, app_event
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, active, paused, archived
  version         INTEGER NOT NULL DEFAULT 1,
  folder_id       UUID,
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflows_tenant ON workflows(tenant_id);
CREATE INDEX idx_workflows_status ON workflows(tenant_id, status);

CREATE TABLE workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  step_order      INTEGER NOT NULL,
  step_type       VARCHAR(50) NOT NULL,  -- action, filter, delay, loop, branch, code, search
  integration_id  UUID REFERENCES integrations(id),
  connection_id   UUID REFERENCES connections(id),
  action_type     VARCHAR(100),  -- create_record, update_record, send_message, etc.
  config          JSONB NOT NULL DEFAULT '{}',
  mapping         JSONB DEFAULT '{}',
  error_config    JSONB DEFAULT '{}',  -- retry policy, error branch
  parent_step_id  UUID REFERENCES workflow_steps(id),  -- for branches/loops
  branch_key      VARCHAR(100),  -- which branch path this step belongs to
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wf_steps_workflow ON workflow_steps(workflow_id, step_order);

CREATE TABLE workflow_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  version         INTEGER NOT NULL,
  definition      JSONB NOT NULL,  -- full snapshot of workflow + steps
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by    UUID REFERENCES users(id),
  UNIQUE(workflow_id, version)
);
```

### Execution Domain (Partitioned)

```sql
CREATE TABLE executions (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  workflow_id     UUID NOT NULL,
  workflow_version INTEGER NOT NULL DEFAULT 1,
  trigger_event_id VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending, running, completed, failed, cancelled, waiting
  input_payload   JSONB,
  output_payload  JSONB,
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions (created by cron job or pg_partman)
CREATE TABLE executions_2026_01 PARTITION OF executions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE executions_2026_02 PARTITION OF executions
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... auto-created monthly

CREATE INDEX idx_executions_tenant ON executions(tenant_id, created_at DESC);
CREATE INDEX idx_executions_workflow ON executions(workflow_id, created_at DESC);
CREATE INDEX idx_executions_status ON executions(tenant_id, status, created_at DESC);

CREATE TABLE execution_steps (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  execution_id    UUID NOT NULL,
  tenant_id       UUID NOT NULL,
  workflow_step_id UUID NOT NULL,
  step_order      INTEGER NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  input_data      JSONB,
  output_data     JSONB,
  error_message   TEXT,
  duration_ms     INTEGER,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_exec_steps_execution ON execution_steps(execution_id, step_order);
```

### Scheduling Domain

```sql
CREATE TABLE schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  cron_expression VARCHAR(100) NOT NULL,
  timezone        VARCHAR(100) NOT NULL DEFAULT 'UTC',
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE status = 'active';

CREATE TABLE webhook_endpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  endpoint_path   VARCHAR(255) UNIQUE NOT NULL,  -- /hooks/<unique-id>
  secret_hash     VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_path ON webhook_endpoints(endpoint_path);
```

### Billing Domain

```sql
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(50) UNIQUE NOT NULL,
  price_monthly   INTEGER NOT NULL,  -- cents
  price_yearly    INTEGER NOT NULL,
  task_limit      INTEGER NOT NULL,
  workflow_limit  INTEGER,
  features        JSONB DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  plan_id         UUID NOT NULL REFERENCES plans(id),
  stripe_subscription_id VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usage_records (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  metric          VARCHAR(50) NOT NULL,  -- task_execution, api_call, etc.
  quantity        INTEGER NOT NULL DEFAULT 1,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
```

---

## Indexing Strategy

### Principles

- Every foreign key has an index
- Composite indexes follow query patterns (tenant_id first for RLS)
- Partial indexes for filtered queries (e.g., `WHERE status = 'active'`)
- No over-indexing: each index costs write performance

### Key Indexes

| Table              | Index                                    | Purpose                         |
| ------------------ | ---------------------------------------- | ------------------------------- |
| workflows          | (tenant_id, status)                      | List active workflows           |
| executions         | (tenant_id, created_at DESC)             | Recent executions per tenant    |
| executions         | (workflow_id, created_at DESC)           | Executions for a workflow       |
| execution_steps    | (execution_id, step_order)               | Steps within an execution       |
| connections        | (tenant_id, integration_id)              | Connections per integration     |
| schedules          | (next_run_at) WHERE status='active'      | Scheduler polling               |
| webhook_endpoints  | (endpoint_path)                          | Fast webhook routing            |
| usage_records      | (tenant_id, metric, recorded_at)         | Billing aggregation             |

---

## Partitioning Strategy

### Why Partition

The `executions` and `execution_steps` tables grow fastest (50M+ rows/day at target scale). Without partitioning, queries slow down and maintenance (VACUUM, backups) becomes problematic.

### Approach

- **Partition by month** on `created_at`
- Auto-create future partitions using `pg_partman` extension
- Drop partitions older than retention period (90 days for step data, 1 year for execution headers)
- Queries always include `created_at` range for partition pruning

### Partition Management

```sql
-- pg_partman configuration
SELECT partman.create_parent(
  p_parent_table := 'public.executions',
  p_control := 'created_at',
  p_type := 'native',
  p_interval := 'monthly',
  p_premake := 3  -- create 3 months ahead
);
```

---

## Connection Pooling

### PgBouncer (Sidecar per Service Pod)

```
Each service pod includes a PgBouncer sidecar container:
  - Mode: transaction pooling
  - Pool size: 20 connections per pod
  - Server lifetime: 3600s
  - Idle timeout: 300s

Total pool size = pods * 20
  Example: 10 pods * 20 = 200 connections
  Aurora max connections: ~5000 (for r6g.2xlarge)
```

This prevents connection storms from Kubernetes pod scaling events.

---

## Read Replica Usage

### Write Path (Aurora Writer)

All INSERT, UPDATE, DELETE operations go to the writer instance. This includes:
- Workflow CRUD
- Execution creation and status updates
- User management
- Billing records

### Read Path (Aurora Readers)

Read replicas serve:
- Dashboard queries (workflow lists, execution history)
- Search and filtering operations
- Analytics aggregations
- Admin panel queries
- Billing usage summation

Application uses separate connection strings for read vs write. NestJS repository pattern with `@ReadOnly()` decorator routes to reader.

---

## Data Retention Policy

| Data Type           | Hot Storage    | Archive        | Delete         |
| ------------------- | -------------- | -------------- | -------------- |
| Workflow definitions | Indefinite     | --             | On user delete |
| Execution headers   | 12 months      | S3 (Glacier)   | After 3 years  |
| Execution steps     | 90 days        | S3 (Glacier)   | After 1 year   |
| Execution payloads  | 30 days        | --             | After 30 days  |
| Usage records       | 12 months      | ClickHouse     | After 5 years  |
| Audit logs          | 12 months      | S3 (WORM)      | After 7 years  |

Retention enforcement via pg_partman drop policies and S3 lifecycle rules.

---

## Migration Strategy

### Tool: Prisma Migrate

```
packages/database/
├── prisma/
│   ├── schema.prisma          -- Source of truth for schema
│   ├── migrations/
│   │   ├── 001_initial/
│   │   │   └── migration.sql
│   │   ├── 002_add_teams/
│   │   │   └── migration.sql
│   │   └── ...
│   └── seed.ts                -- Seed data for development
```

### Migration Rules

1. All migrations are forward-only (no down migrations in production)
2. Column drops require a two-phase approach:
   - Phase 1: Stop reading/writing the column (deploy code change)
   - Phase 2: Drop the column (next release cycle)
3. Large table alterations use `CREATE INDEX CONCURRENTLY`
4. Lock-heavy operations run during maintenance windows with `pg_repack`
5. Every migration is tested against a staging database with production-scale data before promotion

---

## Backup Strategy

```
Continuous Backups:
  - Aurora automated backups (point-in-time recovery, 35-day window)
  - Binary log replication (for cross-region Global Database)

Daily Snapshots:
  - Manual Aurora snapshot at 03:00 UTC daily
  - Retained for 90 days
  - Cross-region copy to eu-west-1

Logical Backups (weekly):
  - pg_dump of critical tables (workflows, connections, tenants)
  - Encrypted and stored in S3 backup bucket
  - Used for disaster recovery testing
```
