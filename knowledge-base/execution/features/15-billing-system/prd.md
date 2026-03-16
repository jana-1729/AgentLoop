# Feature PRD: Billing System

## Problem Statement

River Flow needs a usage-based billing system that meters task executions, manages subscription plans, processes payments via Stripe, handles plan upgrades/downgrades, and provides transparent usage visibility to customers. The billing system must accurately track millions of executions per day and translate them into invoices.

---

## User Stories

1. **As a user**, I want to see transparent pricing tiers and choose a plan that fits my needs.
2. **As a user**, I want to see my current usage (tasks this month) and how much of my plan I've consumed.
3. **As an admin**, I want to upgrade or downgrade my plan and see the billing impact immediately.
4. **As a user**, I want to view my invoices and update my payment method.
5. **As a platform operator**, I want accurate usage metering to ensure correct billing.

---

## Pricing Model

### Plan Tiers

| Plan         | Monthly Price | Annual Price  | Task Limit   | Workflows | Features                              |
| ------------ | ------------- | ------------- | ------------ | --------- | ------------------------------------- |
| Free         | $0            | $0            | 100/month    | 5         | Basic integrations, 15-min schedules  |
| Starter      | $29           | $290 ($24/mo) | 10,000/month | 20        | All integrations, 5-min schedules     |
| Pro          | $99           | $990 ($82/mo) | 100,000/month| Unlimited | Code steps, API access, priority exec |
| Team         | $199          | $1,990        | 500,000/month| Unlimited | Team features, SSO, audit logs        |
| Enterprise   | Custom        | Custom        | Custom       | Unlimited | Dedicated infra, SLA, custom limits   |

### Task Definition

A **task** is counted as one workflow execution (trigger + all steps). Regardless of whether the workflow has 1 step or 20 steps, it counts as 1 task. Failed executions that are automatically retried only count once. Manually retried executions count as a new task.

### Overage Handling

```
When a tenant hits 100% of their task limit:
  Option 1 (default): Workflows are paused, queued triggers wait for next period
  Option 2 (configurable): Overage billing at $0.001 per extra task
  Option 3 (enterprise): Soft limit with notification only
```

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│ Execution Worker │     │ Trigger Service   │
│                  │     │                   │
│ On completion:   │     │ Before execution: │
│ Emit usage event │     │ Check task limit  │
└────────┬─────────┘     └────────┬──────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│ Kafka Topic      │     │ Redis Counter    │
│ billing.usage    │     │ usage:tasks:     │
│ .event           │     │ {tenant}:{month} │
└────────┬─────────┘     └──────────────────┘
         │
         ▼
┌──────────────────┐
│ Billing Service  │
│                  │
│ 1. Consume usage │
│    events        │
│ 2. Aggregate in  │
│    ClickHouse    │
│ 3. Report to     │
│    Stripe        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Stripe           │
│                  │
│ Subscriptions    │
│ Invoices         │
│ Payment methods  │
└──────────────────┘
```

---

## Usage Metering

### Fast Path (Redis)

For real-time limit checking, Redis maintains an approximate counter:

```typescript
async function recordTaskExecution(tenantId: string): Promise<void> {
  const key = `usage:tasks:${tenantId}:${getCurrentMonth()}`;
  const count = await redis.incr(key);

  // Set expiry on first increment
  if (count === 1) {
    await redis.expire(key, 35 * 86400);
  }
}

async function checkTaskLimit(tenantId: string): Promise<boolean> {
  const key = `usage:tasks:${tenantId}:${getCurrentMonth()}`;
  const used = parseInt(await redis.get(key) || '0');
  const limit = await getPlanLimit(tenantId); // cached in Redis

  return used < limit;
}
```

### Accurate Path (ClickHouse)

Kafka events are consumed by the billing service and aggregated in ClickHouse:

```sql
CREATE TABLE usage_events (
  tenant_id    String,
  metric       String,       -- 'task_execution', 'api_call', etc.
  quantity     UInt32,
  workflow_id  String,
  execution_id String,
  timestamp    DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, metric, timestamp);

-- Materialized view for hourly aggregation
CREATE MATERIALIZED VIEW usage_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, metric, toStartOfHour(timestamp))
AS SELECT
  tenant_id,
  metric,
  toStartOfHour(timestamp) as hour,
  sum(quantity) as total
FROM usage_events
GROUP BY tenant_id, metric, hour;

-- Monthly billing query
SELECT tenant_id, sum(total) as monthly_tasks
FROM usage_hourly
WHERE metric = 'task_execution'
  AND hour >= toStartOfMonth(now())
GROUP BY tenant_id;
```

---

## Stripe Integration

### Customer Lifecycle

```
1. User signs up → Create Stripe Customer
   stripe.customers.create({ email, name, metadata: { tenant_id } })

2. User selects plan → Create Stripe Subscription
   stripe.subscriptions.create({ customer, items: [{ price: plan_price_id }] })

3. Monthly cycle:
   - Stripe charges payment method
   - Webhook: invoice.paid → update subscription status
   - Webhook: invoice.payment_failed → notify user, retry

4. Plan change:
   - Upgrade: Prorated charge, immediate effect
   - Downgrade: Takes effect at end of billing period

5. Cancellation:
   - Cancel at end of period (access until period ends)
   - Webhook: customer.subscription.deleted → downgrade to free
```

### Stripe Webhook Handling

```typescript
const stripeWebhooks = {
  'checkout.session.completed': async (event) => {
    const session = event.data.object;
    await activateSubscription(session.metadata.tenant_id, session.subscription);
  },

  'invoice.paid': async (event) => {
    const invoice = event.data.object;
    await recordPayment(invoice);
    await resetMonthlyUsage(invoice.subscription);
  },

  'invoice.payment_failed': async (event) => {
    const invoice = event.data.object;
    await notifyPaymentFailed(invoice);
    // Stripe automatically retries 3 times over 3 weeks
  },

  'customer.subscription.updated': async (event) => {
    const subscription = event.data.object;
    await syncSubscriptionStatus(subscription);
  },

  'customer.subscription.deleted': async (event) => {
    const subscription = event.data.object;
    await downgradeToFree(subscription.metadata.tenant_id);
  },
};
```

### Usage-Based Billing (Overage)

```typescript
// Report usage to Stripe for metered billing
async function reportUsageToStripe(tenantId: string): Promise<void> {
  const subscription = await getSubscription(tenantId);
  const usageItem = subscription.items.find(i => i.price.id === METERED_PRICE_ID);

  if (!usageItem) return; // Plan doesn't have overage

  const unreportedTasks = await getUnreportedTasks(tenantId);

  await stripe.subscriptionItems.createUsageRecord(usageItem.id, {
    quantity: unreportedTasks,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment',
  });
}

// Run hourly via BullMQ cron job
```

---

## Data Model

```typescript
interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  created_at: Date;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  stripe_price_id_monthly: string;
  stripe_price_id_annual: string;
  task_limit: number;
  workflow_limit: number | null;  // null = unlimited
  features: {
    code_steps: boolean;
    api_access: boolean;
    team_features: boolean;
    sso: boolean;
    priority_execution: boolean;
    custom_branding: boolean;
  };
  status: 'active' | 'deprecated';
}

interface Invoice {
  id: string;
  tenant_id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  period_start: Date;
  period_end: Date;
  pdf_url: string;
  created_at: Date;
}
```

---

## API Design

```
Plans:
  GET /api/v1/plans                        -- List available plans

Subscription:
  GET  /api/v1/billing/subscription        -- Current subscription details
  POST /api/v1/billing/checkout            -- Create Stripe Checkout session
    Body: { plan_id, billing_cycle: "monthly" | "annual" }
    Response: { checkout_url }
  POST /api/v1/billing/change-plan         -- Upgrade/downgrade
    Body: { plan_id }
  POST /api/v1/billing/cancel              -- Cancel at end of period

Payment:
  GET  /api/v1/billing/payment-method      -- Current payment method
  POST /api/v1/billing/portal              -- Stripe Customer Portal URL
    Response: { portal_url }

Invoices:
  GET /api/v1/billing/invoices             -- Invoice list
  GET /api/v1/billing/invoices/:id         -- Invoice detail with PDF link

Usage:
  GET /api/v1/billing/usage                -- Current period usage
  GET /api/v1/billing/usage/history        -- Historical usage by period
```

---

## Billing UI

### Plan Selection Page

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│   Free   │  │  Starter │  │   Pro    │  │   Team   │
│   $0/mo  │  │  $29/mo  │  │  $99/mo  │  │  $199/mo │
│          │  │          │  │          │  │          │
│ 100 tasks│  │ 10K tasks│  │ 100K     │  │ 500K     │
│ 5 flows  │  │ 20 flows │  │ Unlimited│  │ Unlimited│
│          │  │          │  │ + Code   │  │ + Teams  │
│          │  │          │  │ + API    │  │ + SSO    │
│          │  │          │  │          │  │ + Audit  │
│ [Current]│  │ [Select] │  │ [Select] │  │ [Select] │
└──────────┘  └──────────┘  └──────────┘  └──────────┘

Toggle: [Monthly] [Annual - Save 17%]
```

### Billing Dashboard

```
┌─────────────────────────────────────────────────┐
│  Billing                                         │
│                                                  │
│  Current Plan: Pro ($99/month)                   │
│  Next billing date: April 1, 2026                │
│  Payment method: Visa ending in 4242             │
│                                                  │
│  This month's usage: 42,387 / 100,000 tasks     │
│  ████████████████████░░░░░░░░░░ 42%              │
│                                                  │
│  [Change Plan] [Manage Payment] [View Invoices]  │
└─────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1 (MVP)
- Plan definitions (free + paid tiers)
- Stripe Checkout for subscription creation
- Basic usage tracking (Redis counter)
- Task limit enforcement (pause on limit)
- Stripe Customer Portal for payment management

### Phase 2
- ClickHouse usage aggregation
- Usage dashboard UI
- Plan upgrade/downgrade with proration
- Invoice history
- Usage alerts (80%, 100%)

### Phase 3
- Annual billing option
- Overage billing (metered usage reporting to Stripe)
- Usage-based plan recommendations
- Billing API for developer access
- Credit system (promotional credits)

### Phase 4
- Enterprise custom plans (sales-assisted)
- Volume discounts
- Multi-currency support
- Revenue analytics dashboard (internal)
- Self-serve enterprise trial
