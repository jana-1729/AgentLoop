# Feature PRD: Workflow Automation Engine

## Problem Statement

Users need to connect multiple applications and automate multi-step processes without writing code. The workflow engine is the core runtime that accepts trigger events, orchestrates step-by-step execution, handles branching/looping logic, manages state across steps, and delivers reliable results even under failure conditions.

---

## User Stories

1. **As a marketing manager**, I want to create a workflow that sends a Slack message whenever a new Typeform response arrives, so I can respond to leads in real time.
2. **As a developer**, I want to trigger a multi-step workflow via API that validates data, transforms it, and pushes it to multiple targets, so I can automate my data pipeline.
3. **As an ops lead**, I want workflows with conditional branches so that high-value leads go to Salesforce while others go to a Google Sheet.
4. **As a user**, I want to loop through a list of items from an API response and perform an action for each one.
5. **As a user**, I want my workflow to retry failed steps automatically and notify me if it still fails after retries.

---

## Workflow Structure

A workflow is a Directed Acyclic Graph (DAG) of steps:

```
Trigger
  │
  ▼
Step 1 (Action)
  │
  ├── [condition: score > 80]
  │         │
  │         ▼
  │    Step 2a (Action: Salesforce)
  │
  └── [else]
            │
            ▼
       Step 2b (Action: Google Sheets)
            │
            ▼
       Step 3 (Notification: Slack)
```

### Step Types

| Type      | Description                                                | Execution Model         |
| --------- | ---------------------------------------------------------- | ----------------------- |
| Trigger   | Entry point: webhook, schedule, API call, polling, app event| Produces execution start event |
| Action    | Call an external API (create record, send message, etc.)   | HTTP call via connection |
| Filter    | Evaluate a condition; stop execution if false              | In-memory evaluation    |
| Branch    | Evaluate conditions and follow matching path(s)           | Router, spawns sub-paths |
| Loop      | Iterate over an array; execute sub-steps for each item    | Sequential or parallel   |
| Delay     | Pause execution for a specified duration                   | Scheduled continuation   |
| Code      | Execute custom JavaScript or Python                        | Sandboxed runtime        |
| Search    | Query an integration for data (lookup)                     | HTTP call via connection |
| Sub-Workflow | Trigger another workflow as a step                      | Async invocation         |

---

## Data Model

### Workflow

```typescript
interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  trigger_type: 'webhook' | 'schedule' | 'api' | 'polling' | 'app_event';
  trigger_config: TriggerConfig;
  status: 'draft' | 'active' | 'paused' | 'archived';
  version: number;
  folder_id?: string;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}
```

### Workflow Step

```typescript
interface WorkflowStep {
  id: string;
  workflow_id: string;
  tenant_id: string;
  step_order: number;
  step_type: StepType;
  integration_id?: string;
  connection_id?: string;
  action_type?: string;
  config: StepConfig;
  mapping: FieldMapping[];
  error_config: ErrorConfig;
  parent_step_id?: string;   // For steps inside branches/loops
  branch_key?: string;       // Which branch path (e.g., "true", "false", "default")
}
```

### Execution

```typescript
interface Execution {
  id: string;
  tenant_id: string;
  workflow_id: string;
  workflow_version: number;
  trigger_event_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';
  input_payload?: Record<string, any>;
  output_payload?: Record<string, any>;
  error_message?: string;
  retry_count: number;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
}
```

### Execution Step

```typescript
interface ExecutionStep {
  id: string;
  execution_id: string;
  tenant_id: string;
  workflow_step_id: string;
  step_order: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  duration_ms?: number;
  started_at?: Date;
  completed_at?: Date;
}
```

---

## API Design

### Workflow CRUD

```
POST   /api/v1/workflows
GET    /api/v1/workflows
GET    /api/v1/workflows/:id
PATCH  /api/v1/workflows/:id
DELETE /api/v1/workflows/:id
```

### Workflow Lifecycle

```
POST   /api/v1/workflows/:id/publish     -- Publish new version
POST   /api/v1/workflows/:id/activate    -- Start accepting triggers
POST   /api/v1/workflows/:id/deactivate  -- Stop accepting triggers
POST   /api/v1/workflows/:id/clone       -- Duplicate workflow
```

### Workflow Steps

```
POST   /api/v1/workflows/:id/steps
GET    /api/v1/workflows/:id/steps
PATCH  /api/v1/workflows/:id/steps/:stepId
DELETE /api/v1/workflows/:id/steps/:stepId
PUT    /api/v1/workflows/:id/steps/reorder
```

### Execution

```
POST   /api/v1/workflows/:id/test        -- Test run with sample data
GET    /api/v1/executions                 -- List executions (filtered)
GET    /api/v1/executions/:id             -- Execution detail
GET    /api/v1/executions/:id/steps       -- Step-by-step results
POST   /api/v1/executions/:id/cancel      -- Cancel running execution
POST   /api/v1/executions/:id/retry       -- Retry failed execution
```

---

## Execution Engine Implementation

### Step Orchestrator

The execution worker processes steps sequentially (with branching/parallel support):

```typescript
async function executeWorkflow(context: ExecutionContext): Promise<void> {
  const steps = await loadWorkflowSteps(context.workflow_id, context.workflow_version);
  const sortedSteps = topologicalSort(steps); // DAG ordering

  for (const step of sortedSteps) {
    if (shouldSkip(step, context)) continue; // Branch condition not met

    context.metadata.current_step = step.step_order;
    await updateExecutionStep(step.id, 'running');

    try {
      const input = resolveInputData(step.mapping, context);
      const output = await executeStep(step, input, context);

      context.step_results.set(step.id, output);
      await persistStepResult(step.id, 'completed', input, output);

    } catch (error) {
      const handled = await handleStepError(step, error, context);
      if (!handled) throw error; // Propagate to execution-level error handler
    }
  }
}
```

### Step Execution by Type

```typescript
async function executeStep(step: WorkflowStep, input: any, ctx: ExecutionContext): Promise<any> {
  switch (step.step_type) {
    case 'action':
      return executeAction(step, input, ctx);
    case 'filter':
      return evaluateFilter(step.config.condition, input, ctx);
    case 'branch':
      return evaluateBranch(step.config.conditions, input, ctx);
    case 'loop':
      return executeLoop(step, input, ctx);
    case 'delay':
      return scheduleDelay(step.config.duration, ctx);
    case 'code':
      return executeCode(step.config.language, step.config.code, input);
    case 'search':
      return executeSearch(step, input, ctx);
    case 'sub_workflow':
      return triggerSubWorkflow(step.config.workflow_id, input);
  }
}
```

### Expression Resolution

Steps reference data from triggers and previous steps using template expressions:

```typescript
function resolveExpression(template: string, context: ExecutionContext): any {
  // Template: "{{trigger.data.email}}"
  // Template: "{{steps.step_1.output.contact_id}}"
  // Template: "Hello {{trigger.data.name}}, your score is {{steps.score_calc.output.score}}"

  return template.replace(/\{\{(.+?)\}\}/g, (_, path) => {
    return getNestedValue(context, path.trim());
  });
}
```

### Branch Evaluation

```typescript
function evaluateBranch(conditions: BranchCondition[], input: any, ctx: ExecutionContext): BranchResult {
  for (const condition of conditions) {
    const value = resolveExpression(condition.field, ctx);
    const matches = evaluateOperator(value, condition.operator, condition.value);
    if (matches) {
      return { branch_key: condition.branch_key, matched: true };
    }
  }
  return { branch_key: 'default', matched: true };
}

// Supported operators
type Operator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'greater_than' | 'less_than'
  | 'is_empty' | 'is_not_empty'
  | 'matches_regex'
  | 'in_list' | 'not_in_list';
```

### Loop Execution

```typescript
async function executeLoop(step: WorkflowStep, input: any, ctx: ExecutionContext): Promise<any[]> {
  const items = resolveExpression(step.config.items_path, ctx);
  if (!Array.isArray(items)) throw new Error('Loop items must be an array');

  const results: any[] = [];
  const maxItems = step.config.max_iterations || 1000;

  for (const [index, item] of items.slice(0, maxItems).entries()) {
    const loopContext = {
      ...ctx,
      loop: { item, index, total: items.length },
    };

    for (const subStep of step.children) {
      const subInput = resolveInputData(subStep.mapping, loopContext);
      const output = await executeStep(subStep, subInput, loopContext);
      results.push(output);
    }
  }

  return results;
}
```

---

## Workflow Versioning

### Publish Model

```
Draft (mutable) -> Publish -> Version N (immutable)

Active workflows always execute using the latest published version.
Old versions are retained for:
  - Audit trail
  - Rollback capability
  - In-flight executions (execute using the version they started with)
```

### Version Snapshot

On publish, the entire workflow definition (steps, mappings, configs) is serialized and stored in `workflow_versions.definition` as a JSONB blob. This ensures executions are deterministic even if the workflow is later modified.

---

## Scaling Considerations

| Concern                    | Strategy                                                    |
| -------------------------- | ----------------------------------------------------------- |
| High trigger throughput    | Kafka partitioning by workflow_id; KEDA auto-scales workers |
| Long-running workflows     | Step checkpointing; resume on worker restart                |
| Large payloads             | Offload to S3; pass S3 references between steps             |
| Loop with many items       | Configurable max iterations (default 1000); parallel option  |
| Concurrent executions      | Kafka consumer group parallelism; no single-point bottleneck |
| Noisy tenants              | Per-tenant rate limiting; priority queues by plan tier       |

---

## Implementation Phases

### Phase 1 (MVP)
- API-triggered workflows only
- Action and filter steps
- Simple field mapping with expression support
- Retry on failure (3 attempts, exponential backoff)
- Execution logging to PostgreSQL

### Phase 2
- Webhook and schedule triggers
- Branch and delay steps
- Workflow versioning and publishing
- Execution logging to OpenSearch

### Phase 3
- Loop and code steps
- Sub-workflows
- Parallel branch execution
- Advanced expression functions (uppercase, date formatting, math)

### Phase 4
- Workflow templates
- AI-assisted workflow creation
- Performance optimization (parallel step execution within DAG)
- Execution replay and debugging tools
