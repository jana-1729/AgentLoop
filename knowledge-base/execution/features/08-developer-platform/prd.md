# Feature PRD: Developer Platform

## Problem Statement

Developers need programmatic access to River Flow for building custom integrations, triggering workflows from their applications, managing automations via CI/CD, and embedding automation capabilities into their own products. The developer platform provides REST APIs, SDKs, a CLI tool, and comprehensive documentation.

---

## User Stories

1. **As a developer**, I want to trigger workflows via a REST API from my backend.
2. **As a developer**, I want a JavaScript SDK to interact with River Flow from my Node.js application.
3. **As a developer**, I want a CLI tool to manage workflows from my terminal and CI/CD pipeline.
4. **As a developer**, I want interactive API documentation where I can test endpoints.
5. **As a developer**, I want webhook events so I can react to workflow completions in my application.

---

## REST API

### Design Principles

- RESTful resource-based URLs
- JSON request/response bodies
- Consistent error format across all endpoints
- Pagination via cursor-based pagination (default) or offset-based
- Filtering via query parameters
- Sorting via `sort` parameter
- Field selection via `fields` parameter (sparse fieldsets)

### API Versioning

```
Base URL: https://api.riverflow.io/v1
Version in URL path (not headers)
Deprecation: 12-month notice before removing old version
```

### Authentication

```
Option 1 - API Key (recommended for server-to-server):
  Header: X-API-Key: rf_live_abc123...

Option 2 - Bearer Token (for user-context operations):
  Header: Authorization: Bearer eyJhbG...

Option 3 - OAuth2 (for third-party app integrations):
  Standard OAuth2 authorization code flow
  Scopes: workflows:read, workflows:write, executions:read, connections:read
```

### Core Endpoints

```
Workflows:
  POST   /v1/workflows                -- Create workflow
  GET    /v1/workflows                -- List workflows
  GET    /v1/workflows/:id            -- Get workflow
  PATCH  /v1/workflows/:id            -- Update workflow
  DELETE /v1/workflows/:id            -- Delete workflow
  POST   /v1/workflows/:id/activate   -- Activate
  POST   /v1/workflows/:id/deactivate -- Deactivate
  POST   /v1/workflows/:id/test       -- Test run

Executions:
  POST   /v1/workflows/:id/execute    -- Trigger execution
  GET    /v1/executions               -- List executions
  GET    /v1/executions/:id           -- Get execution
  GET    /v1/executions/:id/steps     -- Get execution steps
  POST   /v1/executions/:id/cancel    -- Cancel execution
  POST   /v1/executions/:id/retry     -- Retry failed execution

Connections:
  GET    /v1/connections              -- List connections
  GET    /v1/connections/:id          -- Get connection
  DELETE /v1/connections/:id          -- Delete connection
  GET    /v1/connections/:id/test     -- Test connection

Integrations:
  GET    /v1/integrations             -- List available integrations
  GET    /v1/integrations/:id         -- Get integration details

Logs:
  GET    /v1/logs/executions          -- Search execution logs

Usage:
  GET    /v1/usage                    -- Current usage metrics
  GET    /v1/usage/history            -- Historical usage
```

### Request/Response Format

```json
// Successful response
{
  "data": {
    "id": "wf_abc123",
    "name": "Lead Sync",
    "status": "active",
    "created_at": "2026-03-15T10:00:00Z"
  }
}

// List response with pagination
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6MTAwfQ",
    "has_more": true,
    "total": 247
  }
}

// Error response
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Workflow name is required",
    "details": [
      { "field": "name", "message": "must not be empty" }
    ],
    "request_id": "req_xyz789"
  }
}
```

### Idempotency

```
All POST requests support idempotency:
  Header: X-Idempotency-Key: <client-generated-uuid>

Behavior:
  - First request: process normally, cache response (24h TTL in Redis)
  - Duplicate request: return cached response (HTTP 200, same body)
  - Protects against network retries creating duplicate resources
```

---

## SDKs

### JavaScript/TypeScript SDK

```typescript
import { RiverFlow } from '@river-flow/sdk';

const client = new RiverFlow({
  apiKey: 'rf_live_abc123...',
  baseUrl: 'https://api.riverflow.io',
});

// Trigger a workflow
const execution = await client.workflows.execute('wf_abc', {
  data: { email: 'user@example.com', name: 'John' },
  idempotencyKey: 'unique-key-123',
});

// Wait for completion
const result = await client.executions.waitForCompletion(execution.id, {
  timeout: 30_000,
  pollInterval: 1_000,
});

// List workflows
const workflows = await client.workflows.list({
  status: 'active',
  limit: 20,
});

// Stream execution events
const stream = client.executions.stream(execution.id);
stream.on('step:completed', (step) => console.log(step));
stream.on('execution:completed', (result) => console.log(result));
```

### Python SDK

```python
from river_flow import RiverFlow

client = RiverFlow(api_key="rf_live_abc123...")

execution = client.workflows.execute("wf_abc", data={
    "email": "user@example.com",
    "name": "John",
})

result = client.executions.wait_for_completion(
    execution.id, timeout=30
)

print(f"Status: {result.status}")
print(f"Output: {result.output}")
```

### SDK Features

- Automatic retry with exponential backoff (on 429, 500, 502, 503)
- Type-safe request/response objects (TypeScript generics)
- Automatic pagination helpers (iterate all pages)
- WebSocket-based execution streaming
- Configurable timeout and base URL
- Error classes with structured error details

---

## CLI Tool

```bash
# Installation
npm install -g @river-flow/cli

# Authentication
river-flow auth login              # Browser-based OAuth login
river-flow auth set-key rf_live_... # Set API key

# Workflow management
river-flow workflows list
river-flow workflows get wf_abc
river-flow workflows activate wf_abc
river-flow workflows deactivate wf_abc
river-flow workflows export wf_abc > workflow.json
river-flow workflows import < workflow.json

# Trigger execution
river-flow execute wf_abc --data '{"email":"test@example.com"}'
river-flow execute wf_abc --data-file payload.json --wait

# View logs
river-flow logs --workflow wf_abc --status failed --last 10
river-flow logs wf_abc --follow  # Stream logs in real-time

# Connection management
river-flow connections list
river-flow connections test conn_abc

# Connector development
river-flow connector init --name my-connector --auth oauth2
river-flow connector test --trigger new-record
river-flow connector build
river-flow connector publish
```

---

## Webhooks (Outgoing)

River Flow can send webhook notifications to developer endpoints when events occur.

### Webhook Events

```
workflow.execution.completed   -- Execution finished successfully
workflow.execution.failed      -- Execution failed
workflow.activated             -- Workflow was activated
workflow.deactivated           -- Workflow was deactivated
connection.disconnected        -- Connection lost auth
usage.limit.approaching        -- 80% of plan limit
usage.limit.reached            -- 100% of plan limit
```

### Webhook Configuration

```
POST /v1/webhooks
{
  "url": "https://myapp.com/river-flow-events",
  "events": ["workflow.execution.completed", "workflow.execution.failed"],
  "secret": "whsec_abc123..."
}
```

### Webhook Delivery

```
POST https://myapp.com/river-flow-events
Headers:
  Content-Type: application/json
  X-RiverFlow-Signature: sha256=abc123...
  X-RiverFlow-Event: workflow.execution.completed
  X-RiverFlow-Delivery: del_xyz789
  X-RiverFlow-Timestamp: 1710500000

Body:
{
  "event": "workflow.execution.completed",
  "data": {
    "execution_id": "exec_001",
    "workflow_id": "wf_abc",
    "status": "completed",
    "output": { ... }
  },
  "timestamp": "2026-03-15T10:30:00Z"
}
```

Delivery guarantees:
- At-least-once delivery
- Retry: 5 attempts with exponential backoff (10s, 30s, 2m, 10m, 30m)
- Webhook endpoint must return 2xx within 10 seconds
- After all retries exhausted, webhook marked as failing (admin notification)

---

## Developer Portal

### Documentation Site

```
docs.riverflow.io/
├── Getting Started
│   ├── Quick Start Guide
│   ├── Authentication
│   └── Your First Workflow
├── API Reference
│   ├── Workflows
│   ├── Executions
│   ├── Connections
│   ├── Integrations
│   └── Webhooks
├── SDKs
│   ├── JavaScript/TypeScript
│   ├── Python
│   └── CLI
├── Guides
│   ├── Building Custom Connectors
│   ├── Error Handling Best Practices
│   ├── Rate Limits & Pagination
│   └── Security Best Practices
├── Connector SDK
│   ├── Getting Started
│   ├── Authentication Adapters
│   ├── Triggers & Actions
│   └── Publishing
└── Changelog
```

### Interactive API Explorer

- Swagger/OpenAPI-based interactive documentation
- Try It feature: make live API calls from the browser
- Code snippets in JavaScript, Python, cURL for each endpoint
- Response schema documentation with examples

---

## Implementation Phases

### Phase 1 (MVP)
- Core REST API (workflows, executions, triggers)
- API key authentication
- Basic error responses
- cURL documentation

### Phase 2
- JavaScript SDK (npm package)
- CLI tool (basic commands)
- API documentation site
- Idempotency support
- Pagination

### Phase 3
- Python SDK
- Outgoing webhooks
- Interactive API explorer
- OAuth2 for third-party apps
- Rate limit headers

### Phase 4
- Connector SDK (public release)
- Developer portal with guides
- API versioning (v2 alongside v1)
- SDK streaming (WebSocket-based)
- GraphQL API (experimental)
