# API Gateway -- River Flow

## Overview

Kong API Gateway serves as the single entry point for all external traffic to River Flow. It handles TLS termination, authentication, rate limiting, request routing, and observability. Kong runs as a Kubernetes Ingress Controller inside the EKS cluster.

---

## Architecture

```
Internet
    │
    ▼
AWS ALB (TLS termination)
    │
    ▼
Kong Ingress Controller (K8s pods)
    │
    ├── Auth Plugin → Auth Service (JWT/API key validation)
    ├── Rate Limiting Plugin → Redis
    ├── Request Transformer → Inject tenant context headers
    ├── Logging Plugin → OpenTelemetry collector
    │
    ▼
Upstream Services (K8s ClusterIP services)
```

---

## Kong Deployment

```yaml
# Kong runs as a Kubernetes Ingress Controller
Deployment:
  replicas: 3 (production)
  image: kong/kong-gateway:3.6
  resources:
    requests: { cpu: "500m", memory: "512Mi" }
    limits: { cpu: "2", memory: "2Gi" }

Database: dbless mode (declarative config via CRDs)
Config: KongPlugin and KongIngress CRDs in Git (GitOps managed)
```

---

## Route Configuration

### Public API Routes

| Route Pattern                        | Upstream Service      | Auth Required | Rate Limit    |
| ------------------------------------ | --------------------- | ------------- | ------------- |
| `/api/v1/auth/*`                     | auth-service:3001     | No (login)    | 20 req/min    |
| `/api/v1/tenants/*`                  | tenant-service:3002   | JWT           | 100 req/min   |
| `/api/v1/workflows/*`                | workflow-service:3003 | JWT           | 200 req/min   |
| `/api/v1/triggers/api/*`             | trigger-service:3004  | API Key       | Plan-based    |
| `/api/v1/integrations/*`             | integration-service:3006 | JWT        | 100 req/min   |
| `/api/v1/connections/*`              | integration-service:3006 | JWT        | 50 req/min    |
| `/api/v1/billing/*`                  | billing-service:3007  | JWT           | 50 req/min    |
| `/api/v1/logs/*`                     | logging-service:3008  | JWT           | 100 req/min   |

### Webhook Ingestion Routes (High Throughput)

| Route Pattern                        | Upstream Service      | Auth Required | Rate Limit     |
| ------------------------------------ | --------------------- | ------------- | -------------- |
| `/hooks/:endpoint_id`                | trigger-service:3004  | Signature     | 1000 req/min   |

### Internal Admin Routes

| Route Pattern                        | Upstream Service      | Auth Required | Rate Limit    |
| ------------------------------------ | --------------------- | ------------- | ------------- |
| `/admin/api/v1/*`                    | admin-service:3009    | JWT + Admin   | 100 req/min   |

### OAuth Callback Routes

| Route Pattern                        | Upstream Service      | Auth Required | Rate Limit    |
| ------------------------------------ | --------------------- | ------------- | ------------- |
| `/oauth/callback/:provider`          | integration-service:3006 | Session    | 20 req/min    |

---

## Authentication Flow

### JWT Authentication (User Sessions)

```
1. Client sends: Authorization: Bearer <jwt>
2. Kong JWT plugin validates token signature (RS256)
3. On valid:
   - Extract tenant_id, user_id, role from claims
   - Inject headers: X-Tenant-ID, X-User-ID, X-User-Role
   - Forward to upstream
4. On invalid:
   - Return 401 with error code
```

### API Key Authentication (Machine-to-Machine)

```
1. Client sends: X-API-Key: <key>
2. Kong Key-Auth plugin looks up key in Redis cache
3. On cache miss, query auth-service via gRPC
4. On valid:
   - Extract tenant_id from key mapping
   - Inject headers: X-Tenant-ID, X-Auth-Type: api_key
   - Forward to upstream
5. On invalid:
   - Return 401
```

### Webhook Authentication (Integration Webhooks)

```
1. External service sends POST to /hooks/:endpoint_id
2. Kong forwards raw request (no auth plugin)
3. Trigger service verifies:
   - Endpoint exists and is active
   - Signature matches (HMAC-SHA256 with endpoint secret)
   - Payload within size limit (1MB)
```

---

## Rate Limiting

### Plugin: kong-plugin-rate-limiting-advanced

```yaml
# Global rate limit (DDoS protection)
global:
  minute: 10000
  hour: 500000

# Per-consumer (tenant) rate limits
per_consumer:
  strategy: redis
  redis:
    host: redis-cluster
    port: 6379
  policy: redis  # distributed across Kong instances
  fault_tolerant: true  # if Redis is down, allow traffic

# Tier-based limits (applied via consumer groups)
tiers:
  free:
    minute: 60
    hour: 1000
    day: 5000
  starter:
    minute: 300
    hour: 10000
    day: 100000
  pro:
    minute: 1000
    hour: 50000
    day: 500000
  enterprise:
    minute: 5000
    hour: 200000
    day: 2000000
```

### Rate Limit Headers

Every response includes:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1710500400
Retry-After: 13  (only on 429)
```

---

## Request/Response Transformation

### Request Enrichment

Kong injects metadata headers before forwarding to upstream:

```
X-Request-ID: <uuid>              -- Unique per request (for tracing)
X-Tenant-ID: <tenant_uuid>       -- From auth resolution
X-User-ID: <user_uuid>           -- From JWT claims
X-User-Role: admin|developer|viewer
X-Auth-Type: jwt|api_key|webhook
X-Real-IP: <client_ip>           -- From ALB X-Forwarded-For
X-Forwarded-Proto: https
```

### Response Transformation

```
- Strip internal headers (X-Powered-By, Server)
- Add CORS headers for web app origin
- Add security headers:
    Strict-Transport-Security: max-age=31536000
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Content-Security-Policy: default-src 'self'
```

---

## CORS Configuration

```yaml
cors:
  origins:
    - "https://app.riverflow.io"
    - "https://*.riverflow.io"
  methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
  headers:
    - Authorization
    - Content-Type
    - X-API-Key
    - X-Request-ID
    - X-Idempotency-Key
  credentials: true
  max_age: 86400
```

---

## Request Size Limits

| Route                    | Max Body Size | Reason                          |
| ------------------------ | ------------- | ------------------------------- |
| `/hooks/*`               | 1 MB          | Webhook payloads                |
| `/api/v1/workflows/*`    | 512 KB        | Workflow definitions            |
| `/api/v1/triggers/api/*` | 5 MB          | API trigger payloads            |
| Default                  | 256 KB        | Standard API requests           |

Large payloads (>1MB) should use pre-signed S3 upload URLs instead of direct API upload.

---

## Health and Monitoring

### Kong Health Endpoints

```
GET /health        -- Kong proxy health (200 if accepting traffic)
GET /status        -- Kong node status (connections, memory, latency)
```

### Prometheus Metrics (kong-plugin-prometheus)

```
kong_http_requests_total{service, route, code}
kong_request_latency_ms{service, type=[kong, upstream, request]}
kong_bandwidth_bytes{service, direction=[ingress, egress]}
kong_upstream_target_health{upstream, target, state}
```

### Grafana Dashboard

- Request rate per service (RPM)
- Error rate by status code (4xx, 5xx)
- Latency percentiles (p50, p95, p99)
- Rate limit rejections per tenant
- Active connections
- Upstream health status

---

## Error Responses

All errors follow a consistent JSON format:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "You have exceeded your rate limit. Please retry after 13 seconds.",
    "status": 429,
    "request_id": "req_abc123"
  }
}
```

### Standard Error Codes

| HTTP Status | Code                      | Description                      |
| ----------- | ------------------------- | -------------------------------- |
| 400         | `INVALID_REQUEST`         | Malformed request body           |
| 401         | `AUTHENTICATION_REQUIRED` | Missing or invalid credentials   |
| 403         | `INSUFFICIENT_PERMISSIONS`| Valid auth but lacking permission |
| 404         | `RESOURCE_NOT_FOUND`      | Route or resource not found      |
| 413         | `PAYLOAD_TOO_LARGE`       | Request body exceeds limit       |
| 429         | `RATE_LIMIT_EXCEEDED`     | Rate limit hit                   |
| 500         | `INTERNAL_ERROR`          | Unexpected server error          |
| 502         | `UPSTREAM_ERROR`          | Upstream service unavailable     |
| 503         | `SERVICE_UNAVAILABLE`     | Kong or upstream overloaded      |
