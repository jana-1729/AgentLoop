# Feature PRD: Scheduling System

## Problem Statement

Many automations need to run on a time-based schedule rather than in response to external events. Users need to schedule workflows to run at specific times, intervals, or cron patterns. The scheduler must be distributed, timezone-aware, reliable under failure, and able to handle hundreds of thousands of concurrent schedules.

---

## User Stories

1. **As a user**, I want my workflow to run every day at 9 AM in my timezone.
2. **As a user**, I want to set a cron expression for advanced scheduling (e.g., "every weekday at 8 AM and 5 PM").
3. **As a user**, I want to see a history of when my scheduled workflow ran and whether it succeeded.
4. **As a user**, I want my scheduled workflow to catch up if the platform experienced downtime during a scheduled time.
5. **As a user**, I want to pause and resume a schedule without deleting it.

---

## Schedule Types

### 1. Interval-Based

```json
{
  "type": "interval",
  "every": 15,
  "unit": "minutes"
}
```

Supported units: `minutes` (min 1), `hours`, `days`

### 2. Daily at Specific Time

```json
{
  "type": "daily",
  "at": "09:00",
  "timezone": "America/New_York",
  "days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
}
```

### 3. Cron Expression

```json
{
  "type": "cron",
  "expression": "0 9,17 * * 1-5",
  "timezone": "Europe/London"
}
```

### 4. One-Time (Future Run)

```json
{
  "type": "once",
  "run_at": "2026-04-01T09:00:00",
  "timezone": "Asia/Kolkata"
}
```

---

## Data Model

```typescript
interface Schedule {
  id: string;
  tenant_id: string;
  workflow_id: string;
  schedule_type: 'interval' | 'daily' | 'cron' | 'once';
  config: IntervalConfig | DailyConfig | CronConfig | OnceConfig;
  timezone: string;          // IANA timezone (e.g., "America/New_York")
  status: 'active' | 'paused' | 'completed';  // 'completed' for one-time
  catch_up_policy: 'fire_once' | 'fire_all' | 'skip';
  last_run_at: Date | null;
  next_run_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface ScheduleRun {
  id: string;
  schedule_id: string;
  scheduled_at: Date;      // When it was supposed to run
  fired_at: Date;          // When it actually fired
  execution_id: string;    // Resulting workflow execution
  status: 'fired' | 'missed' | 'skipped';
  drift_ms: number;        // Difference between scheduled and actual
}
```

---

## Architecture

### Scheduler Service

Single-leader architecture using BullMQ for coordination:

```
Scheduler Service (3 replicas, 1 active leader via BullMQ)
  │
  ├── Tick Job (runs every 30 seconds)
  │   Evaluates: SELECT * FROM schedules WHERE next_run_at <= NOW() AND status = 'active'
  │
  ├── For each due schedule:
  │   ├── Acquire Redis lock: schedule:lock:{id} (60s TTL)
  │   ├── Produce: trigger.schedule.fired
  │   ├── Update next_run_at
  │   └── Release lock
  │
  └── Health check: ensure tick hasn't stalled
```

### Distributed Lock

```typescript
async function fireSchedule(schedule: Schedule): Promise<void> {
  const lockKey = `schedule:lock:${schedule.id}:${schedule.next_run_at.toISOString()}`;
  const acquired = await redis.set(lockKey, process.env.POD_NAME, 'NX', 'EX', 60);

  if (!acquired) return; // Another instance is handling this schedule

  try {
    await kafka.produce('trigger.schedule.fired', {
      key: schedule.workflow_id,
      value: {
        schedule_id: schedule.id,
        workflow_id: schedule.workflow_id,
        scheduled_at: schedule.next_run_at,
        fired_at: new Date(),
      },
    });

    const nextRun = calculateNextRun(schedule);
    await db.update('schedules', schedule.id, {
      last_run_at: new Date(),
      next_run_at: nextRun,
      status: schedule.schedule_type === 'once' ? 'completed' : schedule.status,
    });

    await db.insert('schedule_runs', {
      schedule_id: schedule.id,
      scheduled_at: schedule.next_run_at,
      fired_at: new Date(),
      status: 'fired',
      drift_ms: Date.now() - schedule.next_run_at.getTime(),
    });
  } catch (error) {
    await redis.del(lockKey);
    throw error;
  }
}
```

---

## Timezone Handling

### Storage

All `next_run_at` values stored as UTC in the database. The timezone is only used for calculation.

### DST (Daylight Saving Time) Handling

```
Example: Schedule "every day at 9 AM" in America/New_York

Normal day:     9:00 AM EST = 14:00 UTC    → next_run_at = 14:00 UTC
After DST:      9:00 AM EDT = 13:00 UTC    → next_run_at = 13:00 UTC
On DST day:     The cron library handles the transition automatically

Spring forward (2:00 AM → 3:00 AM):
  - If scheduled at 2:30 AM: fires at 3:00 AM instead (skipped time)

Fall back (2:00 AM → 1:00 AM):
  - If scheduled at 1:30 AM: fires once (not twice)
```

### User Timezone Detection

```
1. User selects timezone in schedule config (dropdown with IANA zones)
2. Default: detected from browser via Intl.DateTimeFormat().resolvedOptions().timeZone
3. Displayed times always show in user's selected timezone
```

---

## API Design

```
POST   /api/v1/schedules
  Body: { workflow_id, schedule_type, config, timezone, catch_up_policy }
  Response: { id, next_run_at, ... }

GET    /api/v1/schedules
  Query: ?workflow_id=wf_abc&status=active

GET    /api/v1/schedules/:id
  Response: Schedule with next 5 upcoming run times

PATCH  /api/v1/schedules/:id
  Body: { config?, status?, timezone? }
  -- On pause: set next_run_at = NULL
  -- On resume: recalculate next_run_at from NOW

DELETE /api/v1/schedules/:id

GET    /api/v1/schedules/:id/runs
  Query: ?status=fired&from=2026-03-01&limit=20
  Response: Paginated schedule run history

GET    /api/v1/schedules/:id/upcoming
  Query: ?count=10
  Response: Next 10 calculated run times
```

---

## Scaling

| Metric                  | Target                              |
| ----------------------- | ----------------------------------- |
| Total active schedules  | 500K+                               |
| Evaluation tick rate    | Every 30 seconds                    |
| Schedules per tick      | Up to 10,000 (batched queries)      |
| Fire drift (p99)        | < 30 seconds from scheduled time    |
| Concurrent fires        | Limited by Kafka producer throughput |

### Batch Evaluation

```sql
-- Process in batches of 1000
SELECT * FROM schedules
WHERE status = 'active'
  AND next_run_at <= NOW()
ORDER BY next_run_at ASC
LIMIT 1000;

-- Index for fast retrieval
CREATE INDEX idx_schedules_due ON schedules(next_run_at)
  WHERE status = 'active';
```

If more than 1000 schedules are due in one tick, the evaluator processes multiple batches sequentially within the same tick cycle.

---

## Implementation Phases

### Phase 1 (MVP)
- Interval-based schedules (every N minutes/hours)
- Simple cron expressions
- UTC timezone only
- Basic schedule CRUD

### Phase 2
- Full timezone support with DST handling
- Daily/weekly scheduling UI
- Schedule run history
- Catch-up policy (fire_once / skip)

### Phase 3
- One-time future scheduling
- Schedule drift monitoring
- Upcoming runs preview
- Human-readable schedule descriptions ("Every weekday at 9 AM ET")

### Phase 4
- Advanced cron builder UI
- Schedule analytics (reliability, drift trends)
- Smart scheduling suggestions ("This workflow runs best at off-peak hours")
- Schedule dependencies (run workflow B after workflow A completes)
