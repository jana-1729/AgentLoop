# Feature PRD: Marketplace & Templates

## Problem Statement

New users need a fast path to their first automation. Power users want to share and discover community-built connectors and workflow patterns. The marketplace provides pre-built workflow templates, a catalog of integrations, and a community ecosystem for publishing custom connectors.

---

## User Stories

1. **As a new user**, I want to browse templates like "New Stripe payment -> Slack notification" and activate one in a few clicks.
2. **As a user**, I want to search for integrations by name or category and see how many templates use each one.
3. **As a connector developer**, I want to publish my custom connector to the marketplace for others to use.
4. **As a platform admin**, I want to review and approve community connectors before they go live.

---

## Template System

### Template Structure

```typescript
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;          // "Sales", "Marketing", "DevOps", etc.
  tags: string[];
  icon_url: string;
  integrations: string[];    // Integration IDs used in this template
  trigger_type: string;
  estimated_setup_time: string; // "2 minutes"
  popularity: number;        // Install count
  rating: number;            // Community rating (1-5)
  author: {
    type: 'official' | 'community';
    name: string;
  };
  workflow_definition: {
    trigger: TriggerConfig;
    steps: StepConfig[];
    field_mappings: MappingConfig[];
  };
  required_connections: string[];  // User must connect these integrations
  customization_prompts: CustomizationPrompt[];  // Questions asked during setup
}
```

### Template Categories

| Category          | Examples                                                |
| ----------------- | ------------------------------------------------------- |
| Sales & CRM       | Lead routing, contact sync, deal notifications          |
| Marketing         | Campaign tracking, survey responses, newsletter signup  |
| Customer Success  | Onboarding sequences, NPS follow-up, churn alerts       |
| DevOps            | Deployment notifications, incident alerts, CI/CD        |
| HR & Recruiting   | Application tracking, onboarding checklists             |
| Finance           | Invoice processing, payment notifications, expense sync |
| Project Management| Task creation, status updates, sprint automation        |
| Data & Analytics  | Data sync, report generation, dashboard updates         |

### Template Installation Flow

```
1. User browses templates → selects "New Stripe Payment → Slack Alert"
2. Template detail page shows:
   - Description and use case
   - Required integrations (Stripe, Slack)
   - Required connections (which accounts to connect)
   - Estimated setup time
3. User clicks [Use Template]
4. System checks required connections:
   - Stripe connected? ✓
   - Slack connected? ✗ → Prompt to connect Slack
5. Customization prompts:
   - "Which Slack channel?" → #payments
   - "Minimum payment amount to notify?" → $100
6. System creates workflow from template with user's settings
7. Workflow opens in editor for review
8. User clicks [Activate]
```

### Customization Prompts

```json
{
  "customization_prompts": [
    {
      "id": "slack_channel",
      "label": "Which Slack channel should receive notifications?",
      "type": "dynamic_select",
      "source": {
        "connection": "slack",
        "action": "list_channels"
      },
      "maps_to": "steps.2.config.channel_id"
    },
    {
      "id": "min_amount",
      "label": "Minimum payment amount to trigger notification",
      "type": "number",
      "default": 0,
      "maps_to": "steps.1.config.condition.value"
    }
  ]
}
```

---

## Integration Catalog

### Catalog Page

```
┌─────────────────────────────────────────────────┐
│  Integrations                    [Search...]     │
│                                                  │
│  Categories: [All] [CRM] [Email] [Payments]...  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Salesforce│  │  Slack   │  │  Stripe  │      │
│  │  [icon]  │  │  [icon]  │  │  [icon]  │      │
│  │  CRM     │  │  Comms   │  │ Payments │      │
│  │  15 tmpl │  │  23 tmpl │  │  12 tmpl │      │
│  │  [Connect]│  │  [Connect]│  │  [Connect]│    │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                  │
│  Popular Templates Using This Integration:       │
│  • Stripe payment → Google Sheets row            │
│  • Stripe payment → Slack notification           │
│  • Stripe subscription → HubSpot deal update     │
└─────────────────────────────────────────────────┘
```

---

## Community Connector Marketplace

### Publishing Flow

```
1. Developer builds connector using Connector SDK
2. Developer runs: river-flow connector publish
3. Connector package uploaded to staging
4. Automated checks run:
   - Package structure validation
   - Auth flow testing (sandbox credentials)
   - Security scan (no hardcoded secrets, no suspicious network calls)
   - Schema validation (proper JSON schemas for all inputs/outputs)
5. Manual review by River Flow team:
   - Code quality check
   - UX review (naming, descriptions, icons)
   - Rate limit configuration review
6. Approved → Published to marketplace
7. Listed in integration catalog with "Community" badge
```

### Connector Listing

```typescript
interface ConnectorListing {
  id: string;
  integration_id: string;
  name: string;
  description: string;
  author: {
    id: string;
    name: string;
    verified: boolean;
  };
  version: string;
  downloads: number;
  rating: number;
  published_at: Date;
  last_updated_at: Date;
  source_url?: string;     // GitHub repo link (if open source)
  category: string;
  capabilities: {
    triggers: number;
    actions: number;
    searches: number;
  };
  status: 'published' | 'under_review' | 'deprecated';
}
```

### Versioning

```
Connectors follow semver:
  1.0.0 → 1.0.1 (patch: bug fix, auto-upgrade)
  1.0.0 → 1.1.0 (minor: new triggers/actions, auto-upgrade)
  1.0.0 → 2.0.0 (major: breaking changes, manual upgrade with migration guide)

Active workflows pin to major version.
Minor and patch updates applied automatically.
Major version upgrade requires user confirmation.
```

---

## API Design

### Templates

```
GET  /api/v1/templates
  Query: ?category=sales&integrations=stripe,slack&search=payment&sort=popular&page=1
  Response: Paginated template list

GET  /api/v1/templates/:id
  Response: Full template with workflow definition and customization prompts

POST /api/v1/templates/:id/install
  Body: { customization: { slack_channel: "C123", min_amount: 100 } }
  Response: { workflow_id: "wf_new_abc" }  (newly created workflow)
```

### Integration Catalog

```
GET  /api/v1/marketplace/integrations
  Query: ?category=CRM&search=sales&sort=popular
  Response: Integration list with template counts

GET  /api/v1/marketplace/connectors
  Query: ?author=community&category=analytics
  Response: Community connector listings
```

---

## Implementation Phases

### Phase 1 (MVP)
- 20 official templates covering popular use cases
- Template installation flow (basic)
- Integration catalog page
- No community marketplace yet

### Phase 2
- 50+ templates with customization prompts
- Template search and filtering
- Template ratings and popularity tracking
- Template creation from existing workflows ("Save as template")

### Phase 3
- Community connector marketplace (publish, review, install)
- Connector versioning and auto-updates
- Author profiles and verification
- Template collections (curated by theme)

### Phase 4
- Revenue sharing for community connector authors
- Enterprise template library (private templates per org)
- AI-generated templates based on connected integrations
- Template analytics (conversion rate, activation rate)
