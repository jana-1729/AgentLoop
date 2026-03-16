# Feature PRD: Observability Platform

## Problem Statement

Users need full visibility into what their automations are doing. When a workflow fails, they need to know exactly which step failed, what data went in, and what error occurred. Platform operators need system-wide health monitoring, alerting, and analytics. The observability platform provides execution logs, dashboards, real-time monitoring, and alerting.

---

## User Stories

1. **As a user**, I want to see the execution history of my workflows with status, duration, and timestamps.
2. **As a user**, I want to drill into a failed execution and see the exact step that failed, the input data, and the error message.
3. **As a user**, I want a dashboard showing my automation metrics: runs, success rate, tasks used this month.
4. **As a user**, I want to receive an alert (email/Slack) when a workflow fails.
5. **As an admin**, I want system-wide dashboards showing platform health, throughput, and error rates.

---

## Architecture

```
Execution Workers
      │
      ├── Step results → PostgreSQL (execution_steps table)
      ├── Completion events → Kafka
      │
      ▼
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ Logging Service │     │ ClickHouse     │     │ Prometheus     │
│ (Kafka Consumer)│     │ (Analytics)    │     │ (Metrics)      │
│                │     │                │     │                │
│ Writes to:     │     │ Aggregates:    │     │ Scrapes:       │
│ OpenSearch     │     │ Usage per hour │     │ Service metrics │
│ S3 (payloads)  │     │ P50/P95/P99    │     │ K8s metrics    │
└────────────────┘     └────────────────┘     └────────────────┘
      │                       │                       │
      └───────────┬───────────┘                       │
                  ▼                                   ▼
           ┌──────────────┐                  ┌──────────────┐
           │  Grafana      │                  │  Alertmanager │
           │  Dashboards   │                  │  → PagerDuty  │
           └──────────────┘                  │  → Slack      │
                                             └──────────────┘
```

---

## Execution Logging

### Log Levels

Each execution generates logs at multiple levels:

```
Execution Level:
  - execution_id, workflow_id, status, duration, created_at

Step Level:
  - step_id, step_type, status, input_data, output_data, duration_ms, error

Request Level (within each step):
  - HTTP method, URL, request headers, request body
  - HTTP status, response headers, response body
  - Latency, retry count
```

### Storage Strategy

| Data                     | Storage       | Retention | Query Pattern                    |
| ------------------------ | ------------- | --------- | -------------------------------- |
| Execution headers        | PostgreSQL    | 12 months | List, filter, aggregate          |
| Execution steps          | PostgreSQL    | 90 days   | Detail drill-down                |
| Full request/response    | OpenSearch    | 30 days   | Full-text search, debugging      |
| Large payloads (>50KB)   | S3            | 30 days   | On-demand download               |
| Usage metrics            | ClickHouse    | Indefinite| Dashboard analytics              |
| Service health metrics   | Prometheus    | 15 days   | Real-time monitoring             |

### OpenSearch Index Design

```json
{
  "index": "execution-logs-2026-03-15",
  "mappings": {
    "properties": {
      "execution_id": { "type": "keyword" },
      "workflow_id": { "type": "keyword" },
      "tenant_id": { "type": "keyword" },
      "step_id": { "type": "keyword" },
      "step_type": { "type": "keyword" },
      "status": { "type": "keyword" },
      "input_data": { "type": "object", "enabled": false },
      "output_data": { "type": "object", "enabled": false },
      "error_message": { "type": "text" },
      "duration_ms": { "type": "integer" },
      "http_request": {
        "properties": {
          "method": { "type": "keyword" },
          "url": { "type": "keyword" },
          "status_code": { "type": "integer" }
        }
      },
      "created_at": { "type": "date" }
    }
  }
}
```

### ISM (Index State Management) Policy

```
Hot phase (0-7 days):   Full indexing, search-optimized, SSD storage
Warm phase (7-30 days): Read-only, reduced replicas, UltraWarm tier
Delete phase (30+ days): Delete index
```

---

## User-Facing Dashboards

### Workflow Overview Dashboard

```
┌─────────────────────────────────────────────────┐
│  My Workflows                     [Last 7 days] │
│                                                  │
│  Total Runs: 12,847    Success: 98.2%            │
│  Failed: 231           Avg Duration: 2.3s        │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ [Line Chart: Runs over time]             │    │
│  │  ────────── Success                      │    │
│  │  - - - - -  Failed                       │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Top Workflows by Runs:                          │
│  1. New Lead → Salesforce (4,231 runs)           │
│  2. Survey → Google Sheets (3,122 runs)          │
│  3. Stripe → Slack Alert (2,894 runs)            │
│                                                  │
│  Recent Failures:                                │
│  [Error icon] Lead Sync - Step 3: 401 Unauthorized │
│  [Error icon] Invoice Alert - Step 2: Timeout    │
└─────────────────────────────────────────────────┘
```

### Execution History View

```
┌─────────────────────────────────────────────────┐
│  Workflow: New Lead → Salesforce                 │
│  [All] [Completed] [Failed] [Running]  [Search] │
│                                                  │
│  ┌──────┬──────────┬──────────┬─────────┬──────┐│
│  │ ID   │ Status   │ Started  │ Duration│ Steps││
│  ├──────┼──────────┼──────────┼─────────┼──────┤│
│  │ #847 │ ✓ Done   │ 2m ago   │ 1.2s    │ 3/3  ││
│  │ #846 │ ✗ Failed │ 5m ago   │ 3.4s    │ 2/3  ││
│  │ #845 │ ✓ Done   │ 8m ago   │ 0.9s    │ 3/3  ││
│  │ #844 │ ⟳ Retry  │ 12m ago  │ --      │ 1/3  ││
│  └──────┴──────────┴──────────┴─────────┴──────┘│
└─────────────────────────────────────────────────┘
```

### Execution Detail View

```
┌─────────────────────────────────────────────────┐
│  Execution #846 - FAILED                         │
│  Workflow: New Lead → Salesforce                 │
│  Started: 2026-03-15 10:25:00 UTC                │
│  Duration: 3.4s  |  Retries: 2                   │
│                                                  │
│  Timeline:                                       │
│  ──●── Step 1: Webhook Trigger      ✓ 12ms      │
│    │   Input: { email: "john@..." }              │
│    │   Output: { parsed: true }                  │
│    │                                             │
│  ──●── Step 2: Create Salesforce Contact  ✗ 3.2s│
│    │   Input: { email: "john@...", name: "..." } │
│    │   Error: 401 Unauthorized                   │
│    │   HTTP: POST https://salesforce.com/api/... │
│    │   Response: { error: "INVALID_SESSION" }    │
│    │   [View Full Request] [View Full Response]  │
│    │                                             │
│  ──○── Step 3: Send Slack Message   SKIPPED      │
│                                                  │
│  [Retry Execution] [View Workflow] [View Logs]   │
└─────────────────────────────────────────────────┘
```

---

## Alerting System

### Alert Rules (User-Configurable)

```json
{
  "id": "alert_001",
  "tenant_id": "tenant_abc",
  "name": "Lead Sync Failure Alert",
  "workflow_id": "wf_xyz",
  "conditions": {
    "type": "execution_failed",
    "consecutive_failures": 3
  },
  "channels": [
    { "type": "email", "target": "ops@company.com" },
    { "type": "slack", "webhook_url": "https://hooks.slack.com/..." }
  ],
  "cooldown_minutes": 30,
  "status": "active"
}
```

### Built-in Alert Types

| Alert Type                 | Trigger Condition                          |
| -------------------------- | ------------------------------------------ |
| Execution Failed           | Any execution failure                      |
| Consecutive Failures       | N consecutive failures for a workflow      |
| High Failure Rate          | Failure rate exceeds X% in time window     |
| Execution Timeout          | Execution exceeds timeout limit            |
| Connection Auth Failed     | Integration credential expired/invalid     |
| Usage Limit Approaching    | 80% of plan task limit reached             |
| Usage Limit Reached        | 100% of plan task limit reached            |

### Alert Channels

- Email (via SES)
- Slack (via webhook)
- In-app notification (WebSocket push)
- PagerDuty (enterprise)
- Custom webhook (user-defined URL)

---

## Platform-Level Monitoring (Internal)

### Grafana Dashboards

**System Health Dashboard:**
- API request rate and latency (p50, p95, p99)
- Error rate by service (4xx, 5xx)
- Kafka consumer lag per group
- Worker pool utilization
- Database connection pool usage
- Redis memory and hit rate

**Execution Pipeline Dashboard:**
- Executions started/completed/failed per minute
- Step execution duration by type (action, code, filter)
- Integration API call latency (per integration)
- DLQ depth and age

**Tenant Analytics Dashboard:**
- Top tenants by execution volume
- Per-tenant error rates
- Usage distribution across plans
- Tenant growth trend

### Prometheus Metrics

```
# Application metrics (custom)
river_flow_executions_total{tenant_id, workflow_id, status}
river_flow_execution_duration_seconds{workflow_id, status}
river_flow_step_duration_seconds{step_type, integration, status}
river_flow_api_requests_total{service, method, path, status_code}
river_flow_api_request_duration_seconds{service, method, path}
river_flow_active_connections{integration}
river_flow_queue_depth{queue_name}

# Infrastructure metrics (auto-collected)
container_cpu_usage_seconds_total
container_memory_usage_bytes
kube_pod_status_phase
```

---

## API Design

### Execution Logs

```
GET /api/v1/executions
  Query: ?workflow_id=wf_abc&status=failed&from=2026-03-14&to=2026-03-15&page=1&limit=20

GET /api/v1/executions/:id
  Response: Full execution with all step results

GET /api/v1/executions/:id/steps
  Response: Ordered list of step results with input/output/error

GET /api/v1/executions/:id/steps/:stepId/payload
  Response: Full request/response payload (from OpenSearch or S3)
```

### Dashboard Metrics

```
GET /api/v1/analytics/overview
  Query: ?period=7d
  Response: { total_runs, success_rate, failure_rate, avg_duration, tasks_used }

GET /api/v1/analytics/workflows/:id/metrics
  Query: ?period=30d&granularity=day
  Response: { timeseries: [{ date, runs, failures, avg_duration }] }
```

### Alerts

```
POST /api/v1/alerts                   -- Create alert rule
GET  /api/v1/alerts                   -- List alert rules
PATCH /api/v1/alerts/:id              -- Update alert rule
DELETE /api/v1/alerts/:id             -- Delete alert rule
GET /api/v1/alerts/:id/history        -- Alert trigger history
```

---

## Implementation Phases

### Phase 1 (MVP)
- Execution history in PostgreSQL
- Step-level detail view
- Basic filtering (by workflow, status, date range)
- Email alerts on failure

### Phase 2
- OpenSearch for full log search
- Dashboard with charts (runs over time, success rate)
- Slack alert integration
- Execution timeline view

### Phase 3
- ClickHouse for analytics aggregation
- Custom alert rules (consecutive failures, failure rate)
- Real-time execution tracking (WebSocket)
- Large payload viewer (S3 download)

### Phase 4
- Grafana-embedded dashboards for power users
- AI-assisted error diagnosis ("This failure is likely due to expired Salesforce token")
- Anomaly detection (unusual failure patterns)
- Custom metric alerts
