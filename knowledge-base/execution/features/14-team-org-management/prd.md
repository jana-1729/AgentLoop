# Feature PRD: Team & Organization Management

## Problem Statement

Automation platforms are used by teams, not just individuals. Organizations need multi-user access with role-based permissions, team workspaces for organizing workflows, invitation and onboarding flows, and audit trails of who changed what. Enterprise customers additionally require SSO, enforced 2FA, and fine-grained access controls.

---

## User Stories

1. **As an admin**, I want to invite team members and assign them roles (admin, developer, viewer).
2. **As a developer**, I want to organize workflows into folders/workspaces for different projects.
3. **As an admin**, I want to see an audit trail of all changes made by team members.
4. **As an enterprise admin**, I want to enforce SSO and 2FA for all users in my organization.
5. **As a viewer**, I want read-only access to workflows and execution logs without the ability to modify anything.

---

## Organization Model

```
Organization (Tenant)
├── Settings
│   ├── Plan & Billing
│   ├── Security (SSO, 2FA enforcement)
│   └── API Keys
├── Members
│   ├── Owner (1, cannot be removed)
│   ├── Admins
│   ├── Developers
│   └── Viewers
├── Teams (optional grouping)
│   ├── Team A: "Sales Ops"
│   │   └── Members: user1, user2
│   └── Team B: "Engineering"
│       └── Members: user3, user4
└── Workspaces (folders)
    ├── "Lead Management"
    │   ├── Workflow: Lead Sync
    │   └── Workflow: Lead Scoring
    └── "Payment Alerts"
        └── Workflow: Stripe → Slack
```

---

## Data Model

```typescript
interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: OrgSettings;
  created_at: Date;
}

interface OrgSettings {
  sso_enabled: boolean;
  sso_config?: SSOConfig;
  require_2fa: boolean;
  allowed_email_domains: string[];  // e.g., ["company.com"]
  ip_allowlist?: string[];
}

interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  auth_provider: 'email' | 'google' | 'github' | 'saml';
  two_factor_enabled: boolean;
  last_login_at: Date;
  created_at: Date;
}

interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  invited_by: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: Date;
  created_at: Date;
}

interface Team {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  created_at: Date;
}

interface TeamMember {
  team_id: string;
  user_id: string;
  role: 'lead' | 'member';
}

interface Workspace {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  parent_id?: string;  // For nested folders
  team_id?: string;    // Optional team assignment
  created_at: Date;
}
```

---

## Roles & Permissions

### Role Hierarchy

```
Owner
  └── Admin
       └── Developer
            └── Viewer
```

### Permission Matrix

| Permission                  | Owner | Admin | Developer | Viewer |
| --------------------------- | ----- | ----- | --------- | ------ |
| Manage organization         | Y     | N     | N         | N      |
| Manage billing              | Y     | Y     | N         | N      |
| Manage members              | Y     | Y     | N         | N      |
| Configure SSO/security      | Y     | Y     | N         | N      |
| Manage API keys             | Y     | Y     | Y         | N      |
| Create/edit workflows       | Y     | Y     | Y         | N      |
| Activate/deactivate workflows| Y    | Y     | Y         | N      |
| Delete workflows            | Y     | Y     | Y         | N      |
| Create/delete connections   | Y     | Y     | Y         | N      |
| View workflows              | Y     | Y     | Y         | Y      |
| View execution logs         | Y     | Y     | Y         | Y      |
| View usage/analytics        | Y     | Y     | Y         | Y      |
| Retry executions            | Y     | Y     | Y         | N      |
| Manage workspaces           | Y     | Y     | Y         | N      |
| Manage teams                | Y     | Y     | N         | N      |
| View audit logs             | Y     | Y     | N         | N      |

---

## Invitation Flow

```
1. Admin enters email addresses and selects role
2. System sends invitation emails
3. If org has allowed_email_domains, validate email domain
4. Email contains a unique invitation link (48-hour expiry)
5. New user clicks link:
   a. If user has River Flow account → join organization
   b. If new user → sign up → join organization
6. User appears in member list with assigned role
7. Audit event: "user_invited" logged
```

### API

```
POST /api/v1/invitations
Body: {
  "emails": ["alice@company.com", "bob@company.com"],
  "role": "developer",
  "teams": ["team_sales"],       // Optional: auto-add to teams
  "message": "Welcome to our automation workspace!"  // Optional
}

GET /api/v1/invitations
  Query: ?status=pending

POST /api/v1/invitations/:id/resend
DELETE /api/v1/invitations/:id           -- Cancel invitation

POST /api/v1/invitations/:token/accept   -- Accept invitation (public)
```

---

## Workspace Management

### Folder Structure

Workspaces are folders that organize workflows:

```
GET /api/v1/workspaces
Response: {
  "workspaces": [
    {
      "id": "ws_abc",
      "name": "Sales Automations",
      "workflow_count": 5,
      "team": { "id": "team_sales", "name": "Sales Ops" }
    },
    {
      "id": "ws_def",
      "name": "Engineering",
      "workflow_count": 12,
      "team": null
    }
  ]
}

POST /api/v1/workspaces
Body: { "name": "Marketing Campaigns", "team_id": "team_marketing" }

PATCH /api/v1/workflows/:id
Body: { "workspace_id": "ws_abc" }
-- Move workflow to a workspace
```

### Access Control (Future: Fine-Grained)

```
Phase 1: All members see all workflows
Phase 2: Team-based visibility (team members see team workflows)
Phase 3: Custom permissions per workspace
  {
    "workspace_id": "ws_abc",
    "permissions": [
      { "team_id": "team_sales", "role": "editor" },
      { "team_id": "team_marketing", "role": "viewer" }
    ]
  }
```

---

## Member Management API

```
GET  /api/v1/members                     -- List organization members
GET  /api/v1/members/:id                 -- Get member details
PATCH /api/v1/members/:id                -- Update role, suspend/activate
DELETE /api/v1/members/:id               -- Remove from organization

GET  /api/v1/teams                       -- List teams
POST /api/v1/teams                       -- Create team
PATCH /api/v1/teams/:id                  -- Update team
DELETE /api/v1/teams/:id                 -- Delete team
POST /api/v1/teams/:id/members           -- Add member to team
DELETE /api/v1/teams/:id/members/:userId -- Remove from team
```

---

## Onboarding Flow

```
New organization signup:
  1. Create account (email/password or OAuth)
  2. Create organization (name, slug)
  3. Select plan (free to start)
  4. Guided tour:
     a. "Connect your first integration" (suggest popular ones)
     b. "Create your first workflow" (offer templates)
     c. "Invite your team" (enter emails)
  5. Dashboard with progress checklist
```

### Onboarding Checklist

```
□ Create your account
□ Connect an integration
□ Create your first workflow
□ Run a test execution
□ Invite a team member
□ Explore templates

Progress: 3/6 complete
```

---

## Implementation Phases

### Phase 1 (MVP)
- Single-user accounts (no team features)
- Organization creation on signup
- Basic profile management

### Phase 2
- Member invitation and role assignment (owner, admin, developer, viewer)
- Permission enforcement on all API endpoints
- Member list and management UI

### Phase 3
- Teams and workspaces
- Audit trail for member actions
- Onboarding checklist
- Email domain restrictions

### Phase 4
- Fine-grained workspace permissions
- Custom roles (define your own permission sets)
- SCIM provisioning (auto-sync members from IdP)
- Organization switching (user belongs to multiple orgs)
