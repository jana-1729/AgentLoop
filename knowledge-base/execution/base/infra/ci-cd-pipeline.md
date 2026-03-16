# CI/CD Pipeline -- River Flow

## Overview

River Flow uses a GitOps-based deployment model. GitHub Actions handles build, test, and image publishing. ArgoCD handles deployment to Kubernetes. All changes flow through pull requests with automated quality gates.

---

## Repository Structure

```
Monorepo: river-flow/
├── apps/
│   ├── api-gateway/          -- Kong configuration + auth service
│   ├── workflow-service/     -- Workflow CRUD, orchestration
│   ├── execution-worker/     -- Async workflow step execution
│   ├── trigger-service/      -- Webhook ingestion, polling
│   ├── scheduler-service/    -- Cron and scheduled triggers
│   ├── integration-service/  -- Connector registry, connection management
│   ├── tenant-service/       -- Tenant and org management
│   ├── billing-service/      -- Usage metering, Stripe integration
│   ├── logging-service/      -- Execution log ingestion/query
│   ├── admin-service/        -- Internal admin APIs
│   └── web/                  -- Next.js frontend application
├── packages/
│   ├── shared/               -- Shared types, DTOs, constants
│   ├── database/             -- Prisma schema, migrations
│   ├── kafka-client/         -- Kafka producer/consumer wrappers
│   ├── queue-client/         -- BullMQ queue wrappers
│   ├── connector-sdk/        -- SDK for building connectors
│   └── ui/                   -- Shared React component library
├── infra/
│   └── terraform/            -- All Terraform modules
├── k8s/
│   ├── base/                 -- Base K8s manifests (Kustomize)
│   ├── overlays/
│   │   ├── dev/
│   │   ├── staging/
│   │   └── prod/
│   └── argocd/               -- ArgoCD Application manifests
├── .github/
│   └── workflows/            -- GitHub Actions workflow files
├── turbo.json                -- Turborepo pipeline config
├── pnpm-workspace.yaml
└── package.json
```

Monorepo tooling: **Turborepo** for build orchestration, **pnpm** for package management. Turborepo caches build artifacts and only rebuilds changed packages.

---

## GitHub Actions Pipelines

### 1. Pull Request Pipeline (on every PR)

```yaml
trigger: pull_request -> main

jobs:
  lint:
    - pnpm install (cached)
    - turbo run lint --filter=[HEAD^1]
    - Runs ESLint, Prettier check on changed packages only

  typecheck:
    - turbo run typecheck --filter=[HEAD^1]
    - TypeScript strict mode compilation

  unit-test:
    - turbo run test:unit --filter=[HEAD^1]
    - Jest with coverage thresholds (80% lines)
    - Upload coverage to Codecov

  integration-test:
    - Start PostgreSQL, Redis, Kafka via Docker Compose
    - turbo run test:integration --filter=[HEAD^1]
    - Test service interactions with real dependencies

  security-scan:
    - Trivy for dependency vulnerability scanning
    - CodeQL for static analysis
    - Gitleaks for secret detection

  build-check:
    - turbo run build --filter=[HEAD^1]
    - Verify all services compile and Docker images build
```

### 2. Merge to Main Pipeline (on push to main)

```yaml
trigger: push -> main

jobs:
  build-and-push:
    - Determine changed services via Turborepo
    - For each changed service:
      - Build Docker image (multi-stage, distroless base)
      - Tag: {service}:{git-sha-short}
      - Push to ECR
    - Update image tags in k8s/overlays/staging/

  deploy-staging:
    - Commit updated image tags to repo
    - ArgoCD auto-syncs staging namespace
    - Wait for rollout completion
    - Run smoke tests against staging

  notify:
    - Slack notification with deployment summary
    - Link to ArgoCD dashboard
```

### 3. Production Release Pipeline (manual trigger or tag)

```yaml
trigger: git tag v* OR manual workflow dispatch

jobs:
  promote-images:
    - Re-tag staging-proven images for production
    - Push production tags to ECR

  deploy-production:
    - Update k8s/overlays/prod/ with new image tags
    - Create PR for production manifest changes
    - On PR merge, ArgoCD syncs production
    - Canary rollout: 10% -> 50% -> 100% (Istio traffic shifting)

  post-deploy:
    - Run production smoke tests
    - Verify health endpoints
    - Check error rates in Grafana
    - Auto-rollback if error rate > 1% in first 5 minutes
```

---

## Docker Build Strategy

### Multi-Stage Dockerfile (per service)

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/{service}/package.json ./apps/{service}/
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY apps/{service}/ ./apps/{service}/
RUN pnpm --filter @river-flow/{service} build

# Stage 3: Production image
FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app
COPY --from=build /app/apps/{service}/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["dist/main.js"]
```

Image size target: < 150MB per service. Distroless base eliminates shell and package manager (reduced attack surface).

---

## ArgoCD GitOps

### Application Structure

Each service has an ArgoCD Application resource:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: workflow-service
  namespace: argocd
spec:
  project: river-flow
  source:
    repoURL: https://github.com/river-flow/river-flow
    path: k8s/overlays/{env}
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: river-flow-services
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
```

### Sync Waves

ArgoCD sync waves ensure proper deployment order:

```
Wave 0: Secrets (External Secrets Operator syncs from AWS)
Wave 1: Database migrations (Kubernetes Job)
Wave 2: Core services (tenant, auth, integration)
Wave 3: Execution services (workflow, trigger, scheduler)
Wave 4: Workers (execution-worker pods)
Wave 5: Frontend (web app)
```

---

## Database Migrations

### Strategy: Prisma Migrate

```
Migration flow:
  1. Developer modifies packages/database/prisma/schema.prisma
  2. Run: prisma migrate dev --name descriptive_name
  3. Migration SQL generated in prisma/migrations/
  4. Committed with code changes
  5. CI runs: prisma migrate deploy (against staging DB)
  6. Production: K8s Job runs prisma migrate deploy before service rollout
```

### Safety Rules

- Migrations must be backward-compatible (no column drops without deprecation period)
- Large table alterations use `pg_repack` or online DDL strategies
- Migration Job has a 5-minute timeout; failure blocks service deployment
- Rollback migrations are separate PRs (no automatic down migrations in production)

---

## Environment Promotion

```
Feature Branch
    │
    ▼ (PR merged)
  main branch
    │
    ▼ (auto-deploy)
  Staging Environment
    │  - Smoke tests
    │  - Integration tests
    │  - Performance baseline
    │
    ▼ (manual promote / git tag)
  Production Environment
       - Canary rollout
       - Automated health checks
       - Auto-rollback on failure
```

### Environment Parity

Staging mirrors production 1:1 in architecture. Differences are limited to:
- Smaller instance sizes (cost optimization)
- Reduced replica counts
- Synthetic data instead of real customer data
- Relaxed rate limits for testing

---

## Rollback Strategy

### Automated Rollback

ArgoCD tracks deployment history. Rollback triggers:
- Error rate exceeds 1% (Prometheus alert)
- P99 latency exceeds 5s (Prometheus alert)
- Health check failures for > 2 minutes
- Manual trigger via ArgoCD UI or CLI

```bash
argocd app rollback workflow-service
```

### Manual Rollback

```bash
# Revert the image tag in k8s/overlays/prod/
git revert <commit-sha>
git push
# ArgoCD auto-syncs to previous version
```

### Database Rollback

Database changes are intentionally one-directional. If a migration must be undone:
1. Create a new migration that reverses the change
2. Deploy the reverse migration as a forward operation
3. Never use `prisma migrate reset` in production

---

## Secret Management

### Flow

```
AWS Secrets Manager (source of truth)
        │
        ▼ (External Secrets Operator)
  K8s Secret objects
        │
        ▼ (volume mount / env injection)
  Application Pods
```

### Secret Categories

| Category               | Storage                | Rotation     |
| ---------------------- | ---------------------- | ------------ |
| DB credentials         | Secrets Manager        | 90 days      |
| Redis auth token       | Secrets Manager        | 90 days      |
| Kafka SASL creds       | Secrets Manager        | 90 days      |
| JWT signing keys       | Secrets Manager        | Manual       |
| Integration OAuth      | HashiCorp Vault        | Per-refresh  |
| Tenant API keys        | Vault (transit engine) | On-demand    |
| Encryption master keys | AWS KMS                | Annual       |

---

## Monitoring the Pipeline

### Metrics

- Build duration per service (target: < 5 min)
- Test pass rate per PR
- Deployment frequency (target: multiple per day)
- Lead time from commit to production (target: < 30 min)
- Change failure rate (target: < 5%)
- Mean time to recovery (target: < 15 min)

### Alerts

- Build failure on main -> Slack #ci-alerts
- Staging deployment failure -> Slack #ci-alerts + PagerDuty
- Production deployment failure -> PagerDuty + auto-rollback
- Security scan critical finding -> Slack #security + block merge
