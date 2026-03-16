# Feature PRD: Security & Compliance

## Problem Statement

Enterprise customers require strict security guarantees before trusting an automation platform with their credentials and data. River Flow must protect sensitive data at rest and in transit, securely store third-party credentials, provide audit trails, support enterprise authentication (SSO/SAML), and work toward SOC 2 compliance from day one.

---

## User Stories

1. **As an enterprise admin**, I want SSO login so my team uses our corporate identity provider.
2. **As a user**, I want my integration credentials stored securely and never visible in logs.
3. **As a compliance officer**, I want a full audit trail of who did what and when.
4. **As an admin**, I want to restrict platform access by IP address for my organization.
5. **As a user**, I want two-factor authentication to protect my account.

---

## Encryption

### In Transit

```
External traffic:
  - TLS 1.3 (minimum TLS 1.2)
  - ACM certificates on ALB (auto-renewed)
  - HSTS header: Strict-Transport-Security: max-age=31536000

Internal traffic:
  - Istio service mesh with mTLS between all pods
  - Auto-rotated certificates (every 24 hours)
  - gRPC with TLS for inter-service calls

Database connections:
  - Aurora: SSL required (rds.force_ssl=1)
  - Redis: TLS enabled (ElastiCache in-transit encryption)
  - Kafka: TLS + SASL authentication
  - OpenSearch: TLS required
```

### At Rest

```
Databases:
  - Aurora: AES-256 encryption (AWS KMS managed key)
  - Redis: at-rest encryption enabled
  - OpenSearch: node-to-node encryption + at-rest encryption
  - S3: SSE-S3 (default) or SSE-KMS for sensitive buckets

Application-level:
  - Integration credentials: AES-256-GCM with per-tenant key envelope
  - API key secrets: bcrypt hash (never stored plaintext)
  - PII fields: application-level encryption before database storage (future)
```

---

## Secrets Management

### Architecture

```
Integration Credentials Flow:

User connects OAuth       Application never
to Salesforce             sees raw tokens
     │                         │
     ▼                         ▼
┌──────────┐            ┌──────────┐
│ Auth Flow │───tokens──▶│ Vault    │
│ (OAuth2)  │            │          │
└──────────┘            │ Stores:  │
                        │ - access │
                        │   token  │
                        │ - refresh│
                        │   token  │
                        └──────────┘
                              │
                              ▼ (at execution time)
                        ┌──────────┐
                        │ Worker   │
                        │ requests │
                        │ token    │──▶ Uses token for API call
                        │ from     │    Token never persisted
                        │ Vault    │    outside Vault
                        └──────────┘
```

### Vault Configuration

```
Engine: HashiCorp Vault (KV v2 secrets engine)

Secrets paths:
  river-flow/connections/{connection_id}/credentials
  river-flow/tenants/{tenant_id}/encryption-key
  river-flow/system/jwt-signing-key
  river-flow/system/webhook-secrets/{endpoint_id}

Access policies:
  - execution-worker: read-only on connections/*
  - connection-service: read/write on connections/*
  - auth-service: read-only on system/jwt-signing-key
  - No service has access to all secrets

Audit logging:
  - Every Vault access is logged
  - Logs sent to platform.audit.log Kafka topic
```

### Credential Rotation

| Secret Type          | Rotation Frequency | Method                                |
| -------------------- | ------------------ | ------------------------------------- |
| OAuth access tokens  | Per expiry (~1hr)  | Automatic refresh via refresh token   |
| OAuth refresh tokens | On use             | Rotated on each refresh (when supported) |
| API keys (user)      | User-initiated     | User generates new key, old one revoked |
| DB passwords         | 90 days            | AWS Secrets Manager automatic rotation |
| JWT signing key      | Manual/annual      | Key rollover with grace period         |
| Vault unseal keys    | Annual             | Manual ceremony                        |

---

## Audit Logging

### What Gets Logged

Every significant action produces an audit event:

```json
{
  "event_id": "audit_abc123",
  "tenant_id": "tenant_xyz",
  "actor": {
    "user_id": "user_123",
    "email": "admin@company.com",
    "ip_address": "203.0.113.42",
    "user_agent": "Mozilla/5.0..."
  },
  "action": "workflow.updated",
  "resource": {
    "type": "workflow",
    "id": "wf_abc",
    "name": "Lead Sync"
  },
  "details": {
    "changes": {
      "status": { "from": "draft", "to": "active" }
    }
  },
  "timestamp": "2026-03-15T10:30:00Z"
}
```

### Audited Actions

| Category       | Actions                                                    |
| -------------- | ---------------------------------------------------------- |
| Authentication | login, logout, failed_login, password_change, mfa_enable  |
| Workflows      | created, updated, published, activated, deactivated, deleted |
| Connections    | created, tested, deleted, token_refreshed, auth_failed     |
| Team           | member_invited, member_removed, role_changed               |
| API Keys       | created, revoked, used                                     |
| Billing        | plan_changed, payment_succeeded, payment_failed            |
| Admin          | tenant_suspended, feature_flag_changed, manual_retry       |
| Settings       | sso_configured, ip_allowlist_updated, 2fa_enforced         |

### Storage

```
Hot storage (0-90 days):  OpenSearch (searchable, filterable)
Cold storage (90d-7 years): S3 with Object Lock (WORM, tamper-proof)
```

### API

```
GET /api/v1/audit-logs
  Query: ?action=workflow.*&actor=user_123&from=2026-03-01&to=2026-03-15
  Response: Paginated list of audit events
```

---

## Enterprise Authentication

### SAML/SSO

```
Supported IdPs:
  - Okta
  - Azure AD / Entra ID
  - OneLogin
  - Google Workspace
  - Generic SAML 2.0

Configuration per tenant:
  1. Admin uploads IdP metadata XML (or enters URLs manually)
  2. Platform generates SP metadata for the IdP
  3. Admin configures attribute mapping (email, name, groups)
  4. Optional: enforce SSO-only login (disable email/password)
```

### Two-Factor Authentication (2FA)

```
Methods:
  - TOTP (Google Authenticator, Authy)
  - Recovery codes (8 single-use codes)

Enforcement levels:
  - Optional: user chooses to enable
  - Required for admins: all admin roles must enable
  - Required for all: org-wide enforcement (enterprise plan)
```

---

## IP Allowlisting

```
Enterprise tenants can restrict access by IP:

Configuration:
POST /api/v1/settings/ip-allowlist
Body: {
  "enabled": true,
  "addresses": [
    "203.0.113.0/24",
    "198.51.100.42/32"
  ],
  "enforce_for": "all"  // or "api_keys_only"
}

Enforcement:
  - Kong plugin checks client IP against allowlist
  - Requests from non-allowed IPs get 403
  - Webhook endpoints are exempt (external services need access)
```

---

## Data Security

### PII Handling

```
Principles:
  - Execution payloads may contain PII (emails, names, etc.)
  - Payloads stored encrypted at rest (database + S3 encryption)
  - Payloads auto-deleted per retention policy (30-90 days)
  - Secrets NEVER appear in execution logs
  - Log sanitization: mask authorization headers, API keys, passwords
```

### Log Sanitization

```typescript
function sanitizeForLogging(data: any): any {
  const sensitiveKeys = [
    'password', 'secret', 'token', 'api_key', 'apikey',
    'authorization', 'cookie', 'credit_card', 'ssn',
    'access_token', 'refresh_token',
  ];

  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }
  return data;
}
```

---

## SOC 2 Readiness

### Type II Controls to Implement

| Control Area       | Implementation                                              |
| ------------------ | ----------------------------------------------------------- |
| Access Control     | RBAC, SSO, 2FA, API key scoping, IP allowlisting           |
| Data Protection    | Encryption at rest/transit, Vault for secrets, log sanitize |
| Audit Logging      | Comprehensive audit trail, tamper-proof S3 storage          |
| Incident Response  | PagerDuty alerts, runbooks, defined escalation paths        |
| Change Management  | PR reviews, CI/CD pipelines, staging environment            |
| Availability       | Multi-AZ, auto-failover, 99.99% uptime SLA                 |
| Monitoring         | Prometheus + Grafana, uptime checks, anomaly alerts         |
| Vendor Management  | AWS shared responsibility, third-party integration review   |

---

## Implementation Phases

### Phase 1 (MVP)
- TLS everywhere (ALB + Istio mTLS)
- Vault for credential storage
- Basic audit logging (auth events, workflow changes)
- Log sanitization (redact secrets)
- bcrypt for passwords, JWT with RS256

### Phase 2
- SAML/SSO integration
- 2FA (TOTP)
- IP allowlisting
- Audit log search and export
- S3 Object Lock for audit archives

### Phase 3
- SOC 2 Type I preparation
- Penetration testing
- Vulnerability scanning in CI/CD
- Data retention automation
- Compliance dashboard

### Phase 4
- SOC 2 Type II certification
- Data residency options (EU, US)
- Customer-managed encryption keys (BYOK)
- Advanced threat detection
- DPA and BAA agreements for regulated industries
