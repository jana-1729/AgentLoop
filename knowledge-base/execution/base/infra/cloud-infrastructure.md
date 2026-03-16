# Cloud Infrastructure -- River Flow

## Overview

River Flow runs on AWS as the primary cloud provider. All infrastructure is defined as code using Terraform, deployed to Kubernetes (EKS), and managed via GitOps with ArgoCD. The architecture is designed for multi-region failover, horizontal scalability, and cost efficiency.

---

## AWS Account Strategy

```
river-flow-root (Organization)
├── river-flow-prod        (Production workloads)
├── river-flow-staging     (Pre-production mirror)
├── river-flow-dev         (Development / sandbox)
├── river-flow-shared      (Shared services: ECR, DNS, IAM)
└── river-flow-security    (Audit logs, GuardDuty, Config)
```

Each account uses AWS Organizations with Service Control Policies (SCPs) to enforce security boundaries. Cross-account access is managed via IAM roles with assume-role patterns.

---

## Networking (VPC)

### Primary Region: us-east-1

```
VPC CIDR: 10.0.0.0/16

Public Subnets (3 AZs):
  10.0.1.0/24  (us-east-1a) -- ALB, NAT Gateway
  10.0.2.0/24  (us-east-1b)
  10.0.3.0/24  (us-east-1c)

Private Subnets (3 AZs):
  10.0.10.0/24 (us-east-1a) -- EKS worker nodes, services
  10.0.11.0/24 (us-east-1b)
  10.0.12.0/24 (us-east-1c)

Database Subnets (3 AZs):
  10.0.20.0/24 (us-east-1a) -- RDS, ElastiCache, OpenSearch
  10.0.21.0/24 (us-east-1b)
  10.0.22.0/24 (us-east-1c)
```

### Secondary Region: eu-west-1 (hot standby)

Mirrors primary with identical CIDR scheme offset by `10.1.0.0/16`. VPC peering or Transit Gateway connects regions for cross-region replication.

### Network Security

- NAT Gateways in each AZ for outbound traffic from private subnets
- VPC endpoints for S3, ECR, STS, Secrets Manager, SQS (avoid NAT costs)
- Security groups follow least-privilege: services only accept traffic from known sources
- Network ACLs as secondary defense layer
- AWS PrivateLink for Kafka (MSK) and OpenSearch access

---

## Kubernetes (EKS)

### Cluster Configuration

```
Cluster Version: 1.29+
Node Groups:
  system:
    instance: m6i.large (3 nodes, on-demand)
    purpose: CoreDNS, kube-proxy, ArgoCD, monitoring

  services:
    instance: m6i.xlarge (3-20 nodes, mixed on-demand/spot)
    purpose: NestJS microservices (API, workflow, tenant, etc.)
    autoscaling: HPA + Karpenter

  workers:
    instance: c6i.2xlarge (5-100 nodes, spot with on-demand fallback)
    purpose: Workflow execution workers
    autoscaling: KEDA (scale on Kafka consumer lag / BullMQ queue depth)
    taints: execution-only (prevent non-worker pods)

  sandbox:
    instance: c6i.xlarge (2-30 nodes, spot)
    purpose: Code execution sandboxes (V8 isolates, Firecracker)
    taints: sandbox-only
    seccomp/AppArmor profiles enforced
```

### Key Add-ons

- **Karpenter**: Just-in-time node provisioning based on pending pods
- **KEDA**: Event-driven autoscaling (Kafka lag, Redis queue depth)
- **External Secrets Operator**: Syncs AWS Secrets Manager to K8s secrets
- **Cert Manager**: Automated TLS certificates via Let's Encrypt
- **AWS Load Balancer Controller**: Maps K8s Ingress to ALB/NLB
- **Istio Service Mesh**: mTLS between services, traffic management, observability

### Namespace Strategy

```
namespaces:
  river-flow-system      -- ArgoCD, cert-manager, external-secrets
  river-flow-gateway     -- Kong, auth-service
  river-flow-services    -- Core NestJS microservices
  river-flow-execution   -- Workers, sandbox pods
  river-flow-data        -- Kafka Connect, data pipeline jobs
  river-flow-monitoring  -- Prometheus, Grafana, Loki, Tempo
```

---

## Database Infrastructure

### PostgreSQL (Aurora)

```
Engine: Aurora PostgreSQL 15
Instance class:
  Writer:  db.r6g.2xlarge (production)
  Readers: db.r6g.xlarge x 2 (read replicas)

Features:
  - Multi-AZ deployment
  - Auto-scaling read replicas (2-5 based on CPU)
  - Continuous backup to S3 (35-day retention)
  - Point-in-time recovery
  - Performance Insights enabled
  - IAM authentication for service accounts

Connection pooling: PgBouncer sidecar per service pod
  - Transaction mode pooling
  - Max 200 connections per pool
  - Idle timeout: 300s
```

### Redis (ElastiCache)

```
Engine: Redis 7.x (cluster mode enabled)
Node type: cache.r6g.xlarge
Shards: 3 (production), each with 1 replica
Total nodes: 6

Use cases:
  - Session cache (TTL: 24h)
  - Rate limiting counters (sliding window)
  - BullMQ job queues
  - Token cache for integration credentials (TTL: 50min)
  - Distributed locks (Redlock)
  - Real-time workflow status pub/sub

Encryption: in-transit (TLS) + at-rest (AES-256)
```

### Apache Kafka (MSK)

```
Cluster: Amazon MSK Serverless (production)
  - Auto-scales throughput based on demand
  - No broker management overhead

Fallback (cost optimization for dev/staging):
  MSK Provisioned
    Brokers: kafka.m5.2xlarge x 6 (3 AZs, 2 per AZ)
    Storage: 1TB per broker (auto-expanding)

Configuration:
  - Replication factor: 3
  - Min in-sync replicas: 2
  - Retention: 7 days (execution events), 30 days (audit events)
  - Compression: lz4
  - Max message size: 1MB

Connectivity: AWS PrivateLink (no public access)
Encryption: TLS in-transit, KMS at-rest
Schema Registry: AWS Glue Schema Registry (Avro schemas)
```

### OpenSearch

```
Domain: river-flow-logs
Instance: r6g.xlarge.search x 3 (data nodes)
Master: m6g.large.search x 3 (dedicated)
Storage: 500GB gp3 per data node (expandable)
UltraWarm: enabled for logs older than 7 days

Index strategy:
  - execution-logs-YYYY-MM-DD (daily rotation)
  - ISM policy: hot (7d) -> warm (30d) -> delete (90d)

Access: VPC-only via PrivateLink
```

### ClickHouse

```
Deployment: ClickHouse Cloud (managed) or self-hosted on EKS
Shards: 2 (expandable)
Replicas: 2 per shard

Use cases:
  - Usage analytics (tasks executed per tenant per day)
  - Billing metering aggregations
  - Workflow performance metrics
  - Dashboard queries (p50/p95/p99 latencies)

Table engine: ReplicatedMergeTree, partitioned by month
```

---

## Object Storage (S3)

```
Buckets:
  river-flow-execution-payloads-{env}
    - Large input/output payloads (>256KB)
    - Lifecycle: delete after 30 days
    - Encryption: SSE-S3

  river-flow-connector-packages-{env}
    - Connector SDK bundles
    - Versioned bucket
    - CloudFront distribution for fast delivery

  river-flow-backups-{env}
    - Database backups, Kafka snapshots
    - Glacier Deep Archive after 90 days

  river-flow-audit-logs-{env}
    - CloudTrail, VPC Flow Logs, application audit logs
    - Object Lock (WORM) for compliance
    - Retention: 1 year
```

---

## DNS & CDN

```
Domain: riverflow.io (example)
DNS: Route 53
  - Hosted zones per environment
  - Health checks with failover routing
  - Latency-based routing for multi-region

CDN: CloudFront
  - Frontend assets (Next.js static export)
  - Connector package distribution
  - API caching for read-heavy endpoints (integration catalog)

TLS: ACM certificates, auto-renewed
```

---

## Terraform Module Structure

```
terraform/
├── modules/
│   ├── vpc/                 -- VPC, subnets, NAT, endpoints
│   ├── eks/                 -- EKS cluster, node groups, IRSA
│   ├── rds/                 -- Aurora PostgreSQL
│   ├── elasticache/         -- Redis cluster
│   ├── msk/                 -- Kafka (MSK)
│   ├── opensearch/          -- OpenSearch domain
│   ├── s3/                  -- All S3 buckets + policies
│   ├── iam/                 -- Service roles, policies
│   ├── route53/             -- DNS zones, records
│   ├── cloudfront/          -- CDN distributions
│   ├── secrets-manager/     -- Secret rotation configs
│   └── monitoring/          -- CloudWatch alarms, SNS topics
├── environments/
│   ├── dev/
│   │   └── main.tf          -- Dev-specific overrides
│   ├── staging/
│   │   └── main.tf
│   └── prod/
│       └── main.tf
├── backend.tf               -- S3 + DynamoDB remote state
└── versions.tf              -- Provider version locks
```

State management: S3 backend with DynamoDB state locking. Separate state files per environment.

---

## Multi-Region Strategy

### Phase 1 (Launch): Single Region (us-east-1)
- All services in one region
- Cross-AZ redundancy
- S3 cross-region replication to eu-west-1 for backups

### Phase 2 (Scale): Active-Passive
- eu-west-1 as hot standby
- Aurora Global Database (async replication, <1s lag)
- MSK mirroring via MirrorMaker 2
- Route 53 failover routing

### Phase 3 (Global): Active-Active
- Both regions serve traffic
- Route 53 latency-based routing
- CRDTs or conflict resolution for multi-writer scenarios
- Per-region Kafka clusters with cross-region event bridging

---

## Cost Optimization

- **Spot instances** for workers and sandbox nodes (70% cost savings, with on-demand fallback)
- **Reserved instances** for Aurora, ElastiCache, and system EKS nodes (1-year commitment)
- **MSK Serverless** eliminates idle broker costs
- **S3 Intelligent Tiering** for execution payloads
- **OpenSearch UltraWarm** for aging logs
- **Karpenter** right-sizes nodes to actual pod resource requests
- **Cost allocation tags** on every resource for per-tenant cost tracking
- Target monthly infrastructure cost at launch: $3,000-5,000/month (scaling to $20K+ at 1M workflows)

---

## Disaster Recovery

| Component    | RPO        | RTO        | Strategy                                  |
| ------------ | ---------- | ---------- | ----------------------------------------- |
| PostgreSQL   | ~1 second  | < 5 min    | Aurora Multi-AZ auto-failover             |
| Redis        | ~seconds   | < 2 min    | Multi-AZ replica promotion                |
| Kafka        | 0 (sync)   | < 5 min    | Multi-AZ, ISR=2                           |
| OpenSearch   | ~minutes   | < 10 min   | Multi-AZ, automated snapshots             |
| S3           | 0          | 0          | 11 nines durability, cross-region repli.  |
| EKS          | N/A        | < 10 min   | Karpenter re-provisions nodes             |
| Application  | N/A        | < 3 min    | Stateless pods, K8s self-healing          |
