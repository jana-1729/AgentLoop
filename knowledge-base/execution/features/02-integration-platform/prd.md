# Feature PRD: Integration Platform

## Problem Statement

River Flow must connect with hundreds of external applications (Slack, Salesforce, Google Sheets, Stripe, HubSpot, etc.). Each application has its own authentication method, API schema, rate limits, and data formats. The integration platform provides a unified abstraction layer so that the workflow engine interacts with all integrations through a consistent interface.

---

## User Stories

1. **As a user**, I want to browse a catalog of available integrations and connect my accounts with a few clicks.
2. **As a user**, I want OAuth connections to refresh automatically so my workflows never break due to expired tokens.
3. **As a developer**, I want to build custom connectors using an SDK and publish them for my team or the community.
4. **As a platform operator**, I want to add new integrations by defining a connector package without changing the core platform code.

---

## Integration Architecture

```
┌─────────────────────────────────┐
│      Integration Service         │
│                                  │
│  ┌──────────┐  ┌─────────────┐  │
│  │ Connector │  │  Connection │  │
│  │ Registry  │  │  Manager    │  │
│  └──────────┘  └─────────────┘  │
│        │              │          │
│        ▼              ▼          │
│  ┌──────────┐  ┌─────────────┐  │
│  │ Connector │  │   Token     │  │
│  │ Packages  │  │   Manager   │  │
│  │ (S3)      │  │   (Vault)   │  │
│  └──────────┘  └─────────────┘  │
└─────────────────────────────────┘
```

---

## Connector SDK

### Connector Package Structure

```
connectors/salesforce/
├── manifest.json          -- Metadata, auth config, capabilities
├── authentication.ts      -- Auth flow implementation
├── triggers/
│   ├── new-contact.ts     -- Trigger: new contact created
│   └── updated-deal.ts   -- Trigger: deal updated
├── actions/
│   ├── create-contact.ts  -- Action: create a contact
│   ├── update-contact.ts  -- Action: update a contact
│   └── send-email.ts     -- Action: send email via Salesforce
├── searches/
│   └── find-contact.ts   -- Search: find contact by email
└── schemas/
    ├── contact.json       -- JSON Schema for Contact object
    └── deal.json          -- JSON Schema for Deal object
```

### Manifest Schema

```json
{
  "id": "salesforce",
  "name": "Salesforce",
  "version": "1.2.0",
  "description": "Connect with Salesforce CRM",
  "icon": "salesforce.svg",
  "category": "CRM",
  "auth": {
    "type": "oauth2",
    "authorization_url": "https://login.salesforce.com/services/oauth2/authorize",
    "token_url": "https://login.salesforce.com/services/oauth2/token",
    "scopes": ["api", "refresh_token"],
    "refresh_enabled": true
  },
  "base_url": "https://{{instance_url}}/services/data/v58.0",
  "rate_limit": {
    "requests_per_second": 25,
    "daily_limit": 100000
  },
  "triggers": ["new-contact", "updated-deal"],
  "actions": ["create-contact", "update-contact", "send-email"],
  "searches": ["find-contact"]
}
```

### Connector Interface

```typescript
interface ConnectorTrigger {
  id: string;
  name: string;
  description: string;
  input_schema: JSONSchema;    // Fields the user must configure
  output_schema: JSONSchema;   // Shape of trigger data
  sample_output: object;       // Example data for the builder UI

  // For polling triggers
  poll?: (connection: Connection, cursor: string) => Promise<PollResult>;

  // For webhook triggers
  webhook?: {
    subscribe: (connection: Connection, webhookUrl: string) => Promise<void>;
    unsubscribe: (connection: Connection, webhookId: string) => Promise<void>;
    verify: (request: WebhookRequest) => boolean;
    parse: (request: WebhookRequest) => any;
  };
}

interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  input_schema: JSONSchema;    // Fields the user can map
  output_schema: JSONSchema;   // Shape of action result
  sample_output: object;

  execute: (connection: Connection, input: object) => Promise<object>;
}

interface ConnectorSearch {
  id: string;
  name: string;
  description: string;
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  sample_output: object;

  search: (connection: Connection, query: object) => Promise<object[]>;
}
```

---

## Authentication Adapters

### OAuth2

```typescript
class OAuth2Adapter {
  async startAuthFlow(integration: Integration, redirectUri: string): Promise<string> {
    const state = generateSecureState();
    await redis.set(`oauth:state:${state}`, { integration_id, tenant_id }, 'EX', 600);

    return buildAuthUrl({
      authorization_url: integration.auth_config.authorization_url,
      client_id: integration.auth_config.client_id,
      redirect_uri: redirectUri,
      scopes: integration.auth_config.scopes,
      state,
    });
  }

  async handleCallback(code: string, state: string): Promise<TokenSet> {
    const session = await redis.get(`oauth:state:${state}`);
    if (!session) throw new Error('Invalid or expired state');

    const tokens = await exchangeCodeForTokens(code, session.integration_id);
    await vault.store(`connections/${session.tenant_id}/${session.integration_id}`, tokens);

    return tokens;
  }

  async refreshToken(connectionId: string): Promise<TokenSet> {
    const current = await vault.get(`connections/${connectionId}`);
    const newTokens = await requestTokenRefresh(current.refresh_token);
    await vault.store(`connections/${connectionId}`, newTokens);
    return newTokens;
  }
}
```

### API Key

```typescript
class ApiKeyAdapter {
  async storeCredentials(connectionId: string, apiKey: string): Promise<void> {
    await vault.store(`connections/${connectionId}`, {
      type: 'api_key',
      api_key: apiKey,
    });
  }

  async getHeaders(connectionId: string): Promise<Record<string, string>> {
    const creds = await vault.get(`connections/${connectionId}`);
    return { 'Authorization': `Bearer ${creds.api_key}` };
  }
}
```

### Custom Authentication

```typescript
class CustomAuthAdapter {
  // For integrations with non-standard auth (e.g., session tokens, HMAC signatures)
  async authenticate(connectionId: string, config: CustomAuthConfig): Promise<AuthResult> {
    // Execute custom auth logic defined in the connector package
    const connector = await loadConnector(config.integration_id);
    return connector.authentication.authenticate(config.credentials);
  }
}
```

---

## Token Lifecycle Management

### Proactive Refresh

```
Token refresh flow:
1. Connection created with OAuth tokens (access + refresh)
2. Store expiry time: access_token_expires_at
3. BullMQ cron job runs every 5 minutes: check-expiring-tokens
4. Find all connections where access_token_expires_at < NOW() + 10 minutes
5. For each, enqueue a token-refresh job
6. Worker calls OAuth provider's token endpoint with refresh_token
7. Store new tokens in Vault
8. Update expires_at in connections table
```

### 401 Recovery

```
When an execution worker gets a 401 from an external API:
1. Attempt token refresh immediately
2. If refresh succeeds, retry the API call with new token
3. If refresh fails (refresh token also expired):
   a. Mark connection as "requires_reauth"
   b. Send notification to user: "Your Salesforce connection needs re-authentication"
   c. Pause affected workflows (optional, configurable)
```

---

## API Design

### Integration Catalog

```
GET /api/v1/integrations
  Query: ?category=CRM&search=sales&page=1&limit=20
  Response: { integrations: [...], total: 150, page: 1 }

GET /api/v1/integrations/:id
  Response: { id, name, description, auth_type, triggers: [...], actions: [...] }

GET /api/v1/integrations/:id/triggers
  Response: { triggers: [{ id, name, input_schema, output_schema, sample_output }] }

GET /api/v1/integrations/:id/actions
  Response: { actions: [{ id, name, input_schema, output_schema, sample_output }] }
```

### Connections

```
POST /api/v1/connections
  Body: { integration_id, name }
  Response: { id, auth_url } (redirect user to auth_url for OAuth)

GET /api/v1/connections
  Response: { connections: [{ id, integration, name, status, last_used_at }] }

GET /api/v1/connections/:id/test
  Response: { valid: true, message: "Connection is healthy" }

DELETE /api/v1/connections/:id
  -- Revokes tokens, removes from Vault, soft-deletes record
```

### Dynamic Schema Resolution

```
GET /api/v1/connections/:id/schemas/:object_type
  -- Returns live schema from the connected account
  -- Example: GET /connections/conn_1/schemas/contact
  -- Returns: { fields: [{ name: "email", type: "string", required: true }, ...] }
  -- Used by the data mapping UI to show available fields
```

---

## Connector Lifecycle

```
1. DEVELOP
   Developer creates connector using SDK scaffolding CLI:
   $ river-flow connector init --name salesforce --auth oauth2

2. TEST
   Local testing against sandbox accounts:
   $ river-flow connector test --trigger new-contact --connection test-creds.json

3. PACKAGE
   Bundle into deployable package:
   $ river-flow connector build
   Output: salesforce-1.2.0.tar.gz

4. PUBLISH
   Upload to connector registry:
   $ river-flow connector publish

5. REVIEW (marketplace connectors)
   Admin reviews: security, API usage, error handling

6. DEPLOY
   Connector package stored in S3, metadata in integrations table
   Hot-reload: new version available without platform restart
```

---

## Scaling Considerations

| Concern                     | Strategy                                                    |
| --------------------------- | ----------------------------------------------------------- |
| 500+ integrations           | Connector packages as self-contained bundles in S3          |
| Rate limits per integration | Per-integration circuit breaker and token bucket rate limiter|
| Credential security         | All credentials in Vault, never in application DB or logs   |
| OAuth token refresh storms  | Stagger refresh checks; jitter on expiry window             |
| Schema discovery latency    | Cache live schemas in Redis (TTL: 5 min)                    |
| Connector hot reload        | Load connector packages at runtime from S3; no redeploy     |

---

## Implementation Phases

### Phase 1 (MVP)
- 10 integrations (Slack, Google Sheets, HubSpot, Stripe, Salesforce, Gmail, Notion, Airtable, Twilio, GitHub)
- OAuth2 and API key authentication
- Basic CRUD actions and triggers
- Manual connection testing

### Phase 2
- 30+ integrations
- Connector SDK (public beta)
- Webhook subscription management
- Dynamic schema resolution
- Token refresh with 401 recovery

### Phase 3
- 100+ integrations
- Community connector marketplace
- Connector versioning and hot-reload
- Advanced auth (SAML, custom, client certificates)
- Rate limit coordination across tenant connections

### Phase 4
- 500+ integrations
- AI-assisted connector generation from API docs
- Connector health scoring and monitoring
- Bulk operations support (batch API calls)
