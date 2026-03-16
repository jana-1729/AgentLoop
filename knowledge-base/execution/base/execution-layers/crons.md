# Cron & Scheduling Architecture -- River Flow

## Overview

The scheduling system enables time-based workflow triggers. It supports cron expressions, fixed intervals, and one-time scheduled executions. The scheduler is distributed, fault-tolerant, and handles timezone-aware scheduling for users across the globe.

---

## Schedule Types

### 1. Cron Expression

Standard 5-field cron with optional seconds:

```
┌───────────── second (0-59, optional)
│ ┌───────────── minute (0-59)
│ │ ┌───────────── hour (0-23)
│ │ │ ┌───────────── day of month (1-31)
│ │ │ │ ┌───────────── month (1-12)
│ │ │ │ │ ┌───────────── day of week (0-7, 0=Sun)
│ │ │ │ │ │
* * * * * *
```

Examples:
```
*/5 * * * *       Every 5 minutes
0 9 * * 1-5       Every weekday at 9:00 AM
0 0 1 * *         First day of every month at midnight
0 */2 * * *       Every 2 hours
```

### 2. Fixed Interval

```
Every 1 minute
Every 5 minutes
Every 15 minutes
Every 30 minutes
Every 1 hour
Every 6 hours
Every 12 hours
Every 24 hours
```

### 3. One-Time Schedule

```
Run once at: 2026-04-01T09:00:00Z
```

---

## Architecture

```
┌──────────────────────┐
│   Scheduler Service  │
│   (Leader Instance)  │
│                      │
│  ┌────────────────┐  │
│  │ Tick Loop      │  │  Every 30 seconds:
│  │ (BullMQ repeat)│──┼──► Evaluate all active schedules
│  └────────────────┘  │
│          │           │
│          ▼           │
│  ┌────────────────┐  │
│  │ Schedule       │  │  For each due schedule:
│  │ Evaluator      │──┼──► Produce trigger event
│  └────────────────┘  │
│          │           │
└──────────┼───────────┘
           │
           ▼
    ┌──────────────┐
    │  Kafka Topic │
    │  trigger.    │
    │  schedule.   │
    │  fired       │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  Trigger     │
    │  Service     │──► workflow.execution.start
    └──────────────┘
```

---

## Distributed Scheduling

### The Problem

Multiple scheduler instances must not fire the same schedule twice. With horizontal scaling, we need distributed coordination.

### Solution: Leader Election + Distributed Locks

```
Approach: Single-leader scheduler with BullMQ

1. Only ONE scheduler instance evaluates schedules at a time
2. BullMQ repeating job ensures only one evaluation runs per interval
3. The BullMQ worker that picks up the repeating job is the de facto leader
4. If that worker dies, another instance picks up the next repeat
```

### Per-Schedule Locking (Defense in Depth)

Even with single-leader, use Redis locks as a safety net:

```typescript
async function evaluateDueSchedules() {
  const dueSchedules = await db.query(`
    SELECT * FROM schedules
    WHERE status = 'active'
      AND next_run_at <= NOW()
    ORDER BY next_run_at ASC
    LIMIT 100
  `);

  for (const schedule of dueSchedules) {
    const lockKey = `schedule:lock:${schedule.id}`;
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 60);

    if (!acquired) continue; // Another instance already processing

    try {
      await fireSchedule(schedule);
      await updateNextRun(schedule);
    } finally {
      await redis.del(lockKey);
    }
  }
}
```

---

## Next Run Calculation

### Cron Expression Parsing

Library: `cron-parser` (Node.js)

```typescript
import cronParser from 'cron-parser';

function calculateNextRun(cronExpression: string, timezone: string, fromDate?: Date): Date {
  const interval = cronParser.parseExpression(cronExpression, {
    currentDate: fromDate || new Date(),
    tz: timezone,
  });
  return interval.next().toDate();
}
```

### Update After Firing

```sql
UPDATE schedules
SET
  last_run_at = NOW(),
  next_run_at = $1  -- calculated next run
WHERE id = $2;
```

### Timezone Handling

All schedules store a timezone (IANA format):

```
timezone: "America/New_York"
timezone: "Europe/London"
timezone: "Asia/Kolkata"
```

The evaluator converts the cron expression to UTC for comparison:

```typescript
// User schedules: "0 9 * * *" in America/New_York
// During EDT (UTC-4): next_run_at = 13:00 UTC
// During EST (UTC-5): next_run_at = 14:00 UTC

// DST transitions handled automatically by cron-parser with tz option
```

---

## Missed Schedule Recovery

### Scenarios

1. **Scheduler downtime**: Service was unavailable during scheduled time
2. **Clock drift**: next_run_at was slightly in the past when evaluator ran
3. **Heavy load**: Evaluator couldn't process all due schedules in one tick

### Recovery Strategy

```typescript
async function evaluateDueSchedules() {
  // Find schedules that are overdue (next_run_at is in the past)
  const overdueSchedules = await db.query(`
    SELECT * FROM schedules
    WHERE status = 'active'
      AND next_run_at <= NOW()
      AND next_run_at >= NOW() - INTERVAL '1 hour'  -- Only catch up within 1 hour
    ORDER BY next_run_at ASC
    LIMIT 100
  `);

  for (const schedule of overdueSchedules) {
    // Check if this schedule was already fired for this interval
    const alreadyFired = await redis.exists(`schedule:fired:${schedule.id}:${schedule.next_run_at}`);
    if (alreadyFired) {
      // Already fired, just update next_run_at
      await updateNextRun(schedule);
      continue;
    }

    await fireSchedule(schedule);
    await redis.set(`schedule:fired:${schedule.id}:${schedule.next_run_at}`, '1', 'EX', 7200);
    await updateNextRun(schedule);
  }
}
```

### Catch-Up Policy (Configurable per Schedule)

```
Options:
  1. fire_once:  Fire once for the missed interval (default)
  2. fire_all:   Fire for every missed interval (e.g., if hourly missed 3 hours, fire 3 times)
  3. skip:       Skip missed intervals, only fire at next future interval
```

```sql
ALTER TABLE schedules ADD COLUMN catch_up_policy VARCHAR(20) DEFAULT 'fire_once';
```

---

## Schedule Management API

### Create Schedule

```
POST /schedules
{
  "workflow_id": "wf_abc123",
  "cron_expression": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "catch_up_policy": "fire_once",
  "metadata": {
    "description": "Run every weekday at 9 AM ET"
  }
}

Response:
{
  "id": "sched_xyz789",
  "workflow_id": "wf_abc123",
  "cron_expression": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "status": "active",
  "next_run_at": "2026-03-16T13:00:00Z",
  "created_at": "2026-03-15T10:00:00Z"
}
```

### List Schedules

```
GET /schedules?workflow_id=wf_abc123

Response:
{
  "schedules": [...],
  "total": 5
}
```

### Pause / Resume

```
PATCH /schedules/:id
{ "status": "paused" }

-- When paused, next_run_at is set to NULL
-- When resumed, next_run_at is recalculated from NOW
```

### Schedule History

```
GET /schedules/:id/history?limit=20

Response:
{
  "runs": [
    {
      "scheduled_at": "2026-03-15T13:00:00Z",
      "fired_at": "2026-03-15T13:00:01Z",
      "execution_id": "exec_001",
      "status": "completed"
    },
    ...
  ]
}
```

---

## Polling Engine

Polling is used for integrations that do not support webhooks. The polling engine periodically checks for new data and triggers workflows when changes are detected.

### Architecture

```
┌──────────────────────┐
│   Polling Worker     │
│   (BullMQ Consumer)  │
│                      │
│  For each poll job:  │
│  1. Fetch latest     │
│     data from API    │
│  2. Compare with     │
│     last known state │
│  3. If new data:     │
│     produce trigger  │
│  4. Update cursor    │
└──────────────────────┘
```

### Poll Job Configuration

```typescript
interface PollJob {
  connection_id: string;
  tenant_id: string;
  integration_id: string;
  poll_config: {
    endpoint: string;           // API endpoint to poll
    method: 'GET';
    interval_seconds: number;   // 60, 300, 900 (1min, 5min, 15min)
    cursor_field: string;       // Field to track last seen (e.g., "updated_at")
    cursor_value: string;       // Last known cursor value
    dedup_field: string;        // Field for deduplication (e.g., "id")
  };
}
```

### Deduplication

```
Redis Set per poll job:
  Key: poll:seen:<connection_id>:<workflow_id>
  Members: Set of record IDs already seen
  TTL: 24 hours (rolling window)

On each poll:
  1. Fetch records from API (filter by cursor_field > cursor_value)
  2. For each record:
     - Check if record ID is in the seen set
     - If not seen: trigger workflow, add to seen set
     - If seen: skip
  3. Update cursor_value to latest record's cursor field
```

---

## Monitoring

### Schedule Health Metrics

```
river_flow_schedules_active_total                    -- Gauge: total active schedules
river_flow_schedule_evaluations_total{status}        -- Counter: evaluations run
river_flow_schedule_fires_total                      -- Counter: schedules fired
river_flow_schedule_missed_total                     -- Counter: missed/recovered
river_flow_schedule_evaluation_duration_seconds      -- Histogram: evaluation loop time
river_flow_schedule_drift_seconds                    -- Histogram: time between scheduled and actual fire
```

### Alerts

| Alert                          | Condition                           | Action                      |
| ------------------------------ | ----------------------------------- | --------------------------- |
| Evaluation loop stalled        | No evaluation in 2 minutes          | Check scheduler health      |
| High schedule drift            | Avg drift > 30 seconds for 5 min   | Scale scheduler / reduce batch |
| Missed schedules               | > 10 missed in 10 minutes          | Investigate scheduler logs  |
| Poll job failures              | > 20% failure rate                  | Check integration API health|

### Grafana Dashboard

- Active schedules by type (cron, interval, one-time)
- Schedule fires per minute (trend)
- Fire drift distribution (p50, p95, p99)
- Missed schedule rate
- Poll job success/failure rates
- Next evaluations timeline (upcoming fires in next hour)
