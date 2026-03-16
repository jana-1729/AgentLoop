# Auth Service -- River Flow

## Overview

The Auth Service handles all authentication and authorization for River Flow. It issues JWTs for user sessions, validates API keys for machine-to-machine access, manages OAuth2 social login, supports SAML/SSO for enterprise customers, and enforces RBAC permissions across all services.

---

## Authentication Methods

### 1. Email/Password (JWT)

```
POST /auth/login
Body: { email, password }

Flow:
1. Validate email exists in users table
2. Verify password against bcrypt hash (cost factor 12)
3. Check user status is active
4. Check tenant status is active
5. Issue JWT access token (15 min TTL)
6. Issue refresh token (7 day TTL, stored in Redis)
7. Return tokens + user profile

JWT Claims:
{
  "sub": "<user_id>",
  "tid": "<tenant_id>",
  "role": "admin",
  "permissions": ["workflows:write", "connections:read"],
  "iat": 1710500000,
  "exp": 1710500900
}

Signing: RS256 (asymmetric)
  - Private key: in Vault (auth-service only)
  - Public key: distributed to Kong and all services for verification
```

### 2. OAuth2 Social Login

```
Providers: Google, GitHub, Microsoft (extensible)

Flow:
1. Client redirects to: GET /auth/oauth/:provider
2. Auth service redirects to provider authorization URL
3. User authenticates with provider
4. Provider redirects to: GET /auth/oauth/callback?code=<code>&state=<state>
5. Auth service exchanges code for provider tokens
6. Extract email and profile from provider
7. Match or create user in database
8. Issue River Flow JWT (same as email/password)
```

### 3. SAML/SSO (Enterprise)

```
Flow:
1. Tenant admin configures SAML IdP metadata
2. User navigates to: GET /auth/sso/:tenant_slug
3. Auth service generates SAML AuthnRequest
4. Redirects to IdP (Okta, Azure AD, etc.)
5. IdP authenticates user, sends SAML Response
6. Auth service validates SAML assertion (signature, audience, expiry)
7. Map SAML attributes to user profile
8. Issue River Flow JWT

Configuration per tenant:
{
  "sso_enabled": true,
  "idp_entity_id": "https://idp.example.com",
  "idp_sso_url": "https://idp.example.com/sso",
  "idp_certificate": "-----BEGIN CERTIFICATE-----...",
  "attribute_mapping": {
    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
  }
}
```

### 4. API Key Authentication (M2M)

```
Use case: Developers triggering workflows via API, CI/CD pipelines

Creation:
POST /auth/api-keys
Body: { label: "CI Pipeline Key", scopes: ["triggers:write"] }
Response: { key: "rf_live_abc123...", key_id: "key_xyz" }

The full key is shown ONCE. Only key_id + hash are stored.

Validation (called by Kong):
1. Kong sends key to auth-service gRPC endpoint
2. Auth service looks up key hash in Redis (cache)
3. On miss, query tenant_credentials table
4. Return: { valid, tenant_id, scopes }
5. Cache result in Redis (TTL: 5 min)
```

---

## Token Management

### Access Token

```
Type: JWT (RS256)
TTL: 15 minutes
Storage: Client-side only (no server storage)
Refresh: Via refresh token endpoint
```

### Refresh Token

```
Type: Opaque token (random 256-bit string)
TTL: 7 days (sliding window)
Storage: Redis hash
  Key: refresh_token:<token_hash>
  Value: { user_id, tenant_id, device_id, issued_at }

Rotation: Each refresh issues a new refresh token, invalidating the old one
Revocation: DELETE /auth/logout (invalidates all sessions for user)
```

### Token Refresh Flow

```
POST /auth/token/refresh
Body: { refresh_token: "rt_abc123..." }

1. Look up refresh token in Redis
2. Validate not expired
3. Load user + tenant (check still active)
4. Issue new access token
5. Issue new refresh token (rotate)
6. Delete old refresh token from Redis
7. Return new token pair
```

---

## RBAC (Role-Based Access Control)

### Roles

| Role        | Description                                  |
| ----------- | -------------------------------------------- |
| `owner`     | Tenant creator, full control, cannot be removed |
| `admin`     | Full control except billing and danger zone  |
| `developer` | Manage workflows, connections, view logs     |
| `viewer`    | Read-only access to everything               |

### Permission Matrix

| Permission              | Owner | Admin | Developer | Viewer |
| ----------------------- | ----- | ----- | --------- | ------ |
| `tenants:manage`        | Y     | N     | N         | N      |
| `billing:manage`        | Y     | Y     | N         | N      |
| `team:manage`           | Y     | Y     | N         | N      |
| `workflows:write`       | Y     | Y     | Y         | N      |
| `workflows:read`        | Y     | Y     | Y         | Y      |
| `connections:write`     | Y     | Y     | Y         | N      |
| `connections:read`      | Y     | Y     | Y         | Y      |
| `executions:read`       | Y     | Y     | Y         | Y      |
| `triggers:write`        | Y     | Y     | Y         | N      |
| `api_keys:manage`       | Y     | Y     | Y         | N      |
| `logs:read`             | Y     | Y     | Y         | Y      |
| `admin:access`          | Y     | Y     | N         | N      |

### Permission Enforcement

Every service validates permissions via a shared middleware:

```typescript
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('workflows:write')
@Post('/workflows')
async createWorkflow(@TenantContext() ctx: TenantCtx, @Body() dto: CreateWorkflowDto) {
  // Only executes if user has workflows:write permission
}
```

The permission check reads from the JWT claims (no additional DB call for standard roles). Custom permissions (future) would require a lookup.

---

## Session Security

### Protections

- **Brute force prevention**: 5 failed login attempts -> 15 min lockout (Redis counter)
- **Concurrent session limit**: Max 5 active sessions per user (configurable)
- **Session invalidation**: Logout invalidates all refresh tokens for user
- **IP binding** (optional, enterprise): Session bound to originating IP
- **Device tracking**: Each refresh token tagged with device fingerprint
- **Suspicious activity detection**: Login from new country/device -> email notification

### Password Requirements

```
Minimum length: 8 characters
Must contain: uppercase, lowercase, number
Breached password check: HaveIBeenPwned API (k-anonymity model)
Password hashing: bcrypt, cost factor 12
```

---

## Service-to-Service Authentication

### gRPC Between Services

```
Method: mTLS via Istio service mesh
- Each pod has an Envoy sidecar with auto-rotated certificates
- Services communicate over encrypted channels within the mesh
- No application-level auth needed for internal calls
- Istio AuthorizationPolicy restricts which services can call which
```

### Service Identity

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: connection-service-policy
spec:
  selector:
    matchLabels:
      app: integration-service
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/river-flow-execution/sa/execution-worker"
              - "cluster.local/ns/river-flow-services/sa/workflow-service"
      to:
        - operation:
            methods: ["POST"]
            paths: ["/grpc.ConnectionService/*"]
```

---

## API Key Scoping

API keys can be scoped to specific permissions:

```json
{
  "key_id": "key_xyz",
  "tenant_id": "tenant_abc",
  "scopes": ["triggers:write", "workflows:read"],
  "ip_allowlist": ["203.0.113.0/24"],
  "expires_at": "2027-01-01T00:00:00Z"
}
```

Scope validation:
1. Kong resolves API key to tenant + scopes
2. Injects `X-Auth-Scopes: triggers:write,workflows:read` header
3. Service permission guard checks both role permissions AND scope permissions
4. Request must satisfy BOTH (intersection)

---

## Audit Trail

Every authentication event is logged:

```json
{
  "event_type": "auth.login.success",
  "tenant_id": "tenant_abc",
  "user_id": "user_123",
  "ip_address": "203.0.113.42",
  "user_agent": "Mozilla/5.0...",
  "auth_method": "email_password",
  "timestamp": "2026-03-15T10:30:00Z"
}
```

Events logged:
- `auth.login.success` / `auth.login.failed`
- `auth.logout`
- `auth.token.refreshed`
- `auth.api_key.created` / `auth.api_key.revoked`
- `auth.sso.login`
- `auth.password.changed` / `auth.password.reset`
- `auth.brute_force.lockout`

All auth audit events are published to `platform.audit.log` Kafka topic.
