# Frontend Architecture -- River Flow

## Overview

The River Flow web application is built with Next.js 14 (App Router), React 18, and React Flow for the visual workflow builder. The frontend provides a modern, responsive interface for managing workflows, connections, executions, and team settings. It communicates with backend services exclusively through the Kong API gateway.

---

## Tech Stack

| Layer              | Technology                    | Purpose                              |
| ------------------ | ----------------------------- | ------------------------------------ |
| Framework          | Next.js 14 (App Router)      | SSR, routing, API routes, middleware |
| UI Library         | React 18                      | Component rendering                  |
| Workflow Canvas    | React Flow                    | Visual drag-and-drop workflow editor |
| State Management   | Zustand                       | Lightweight global state             |
| Server State       | TanStack Query (React Query)  | API data fetching, caching, sync     |
| Styling            | Tailwind CSS                  | Utility-first CSS                    |
| Component Library  | shadcn/ui                     | Pre-built accessible components      |
| Forms              | React Hook Form + Zod         | Form management with validation      |
| Real-Time          | WebSocket (native)            | Live execution status updates        |
| Charts             | Recharts                      | Dashboard analytics charts           |
| Code Editor        | Monaco Editor                 | Code step editing (JS/Python)        |
| Icons              | Lucide React                  | Consistent icon set                  |
| Date/Time          | date-fns                      | Timezone-aware date formatting       |
| Testing            | Vitest + Testing Library      | Unit and integration tests           |
| E2E Testing        | Playwright                    | End-to-end browser tests             |

---

## Application Structure

```
apps/web/
├── app/                          -- Next.js App Router
│   ├── (auth)/                   -- Auth layout group (no sidebar)
│   │   ├── login/
│   │   ├── signup/
│   │   ├── forgot-password/
│   │   └── oauth/callback/
│   ├── (dashboard)/              -- Main app layout (with sidebar)
│   │   ├── layout.tsx            -- Dashboard shell: sidebar + header
│   │   ├── page.tsx              -- Dashboard home / overview
│   │   ├── workflows/
│   │   │   ├── page.tsx          -- Workflow list
│   │   │   ├── new/page.tsx      -- Create workflow
│   │   │   └── [id]/
│   │   │       ├── page.tsx      -- Workflow detail / canvas
│   │   │       ├── editor/page.tsx -- Workflow builder (React Flow)
│   │   │       ├── runs/page.tsx  -- Execution history
│   │   │       └── settings/page.tsx
│   │   ├── connections/
│   │   │   ├── page.tsx          -- Connection list
│   │   │   └── [id]/page.tsx     -- Connection detail
│   │   ├── integrations/
│   │   │   ├── page.tsx          -- Integration catalog
│   │   │   └── [id]/page.tsx     -- Integration detail
│   │   ├── executions/
│   │   │   ├── page.tsx          -- Global execution log
│   │   │   └── [id]/page.tsx     -- Execution detail (step-by-step)
│   │   ├── templates/
│   │   │   └── page.tsx          -- Template marketplace
│   │   ├── settings/
│   │   │   ├── page.tsx          -- General settings
│   │   │   ├── team/page.tsx     -- Team management
│   │   │   ├── billing/page.tsx  -- Billing & plans
│   │   │   ├── api-keys/page.tsx -- API key management
│   │   │   └── security/page.tsx -- SSO, 2FA settings
│   │   └── admin/                -- Internal admin (feature-flagged)
│   │       ├── tenants/page.tsx
│   │       ├── system/page.tsx
│   │       └── dlq/page.tsx
│   ├── api/                      -- Next.js API routes (BFF pattern)
│   │   └── auth/
│   │       └── [...nextauth]/route.ts
│   ├── layout.tsx                -- Root layout (providers, fonts)
│   ├── globals.css               -- Tailwind imports + custom CSS
│   └── not-found.tsx
├── components/
│   ├── ui/                       -- shadcn/ui base components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── breadcrumbs.tsx
│   │   └── mobile-nav.tsx
│   ├── workflow/
│   │   ├── canvas/               -- React Flow components
│   │   │   ├── workflow-canvas.tsx
│   │   │   ├── nodes/
│   │   │   │   ├── trigger-node.tsx
│   │   │   │   ├── action-node.tsx
│   │   │   │   ├── filter-node.tsx
│   │   │   │   ├── delay-node.tsx
│   │   │   │   ├── branch-node.tsx
│   │   │   │   ├── loop-node.tsx
│   │   │   │   └── code-node.tsx
│   │   │   ├── edges/
│   │   │   │   └── custom-edge.tsx
│   │   │   └── panels/
│   │   │       ├── node-config-panel.tsx
│   │   │       ├── data-mapping-panel.tsx
│   │   │       └── test-panel.tsx
│   │   ├── step-config/
│   │   │   ├── trigger-config.tsx
│   │   │   ├── action-config.tsx
│   │   │   └── code-editor.tsx
│   │   └── workflow-card.tsx
│   ├── connections/
│   │   ├── connection-card.tsx
│   │   ├── oauth-connect-button.tsx
│   │   └── connection-status.tsx
│   ├── executions/
│   │   ├── execution-list.tsx
│   │   ├── execution-timeline.tsx
│   │   ├── step-detail.tsx
│   │   └── payload-viewer.tsx
│   └── shared/
│       ├── data-table.tsx
│       ├── search-input.tsx
│       ├── empty-state.tsx
│       ├── loading-skeleton.tsx
│       └── error-boundary.tsx
├── lib/
│   ├── api/                      -- API client layer
│   │   ├── client.ts             -- Axios/fetch wrapper with auth
│   │   ├── workflows.ts          -- Workflow API functions
│   │   ├── connections.ts
│   │   ├── executions.ts
│   │   ├── integrations.ts
│   │   ├── billing.ts
│   │   └── admin.ts
│   ├── hooks/                    -- Custom React hooks
│   │   ├── use-workflows.ts      -- TanStack Query hooks
│   │   ├── use-executions.ts
│   │   ├── use-connections.ts
│   │   ├── use-websocket.ts      -- WebSocket connection hook
│   │   ├── use-debounce.ts
│   │   └── use-permissions.ts
│   ├── stores/                   -- Zustand stores
│   │   ├── auth-store.ts
│   │   ├── workflow-editor-store.ts
│   │   └── ui-store.ts
│   ├── utils/
│   │   ├── cn.ts                 -- Class name utility
│   │   ├── format-date.ts
│   │   ├── expression-parser.ts  -- Parse {{step.field}} expressions
│   │   └── permissions.ts
│   └── validations/              -- Zod schemas
│       ├── workflow.ts
│       ├── connection.ts
│       └── auth.ts
├── public/
│   ├── integration-icons/        -- SVG icons for integrations
│   └── images/
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Key UI Patterns

### Workflow Canvas (React Flow)

The core UX of the product. Users build workflows by dragging nodes onto a canvas and connecting them.

```
Node Types:
  TriggerNode:  Starting point (webhook, schedule, API, polling)
  ActionNode:   Perform operation on an integration (create, update, send)
  FilterNode:   Conditional gate (pass/block based on condition)
  BranchNode:   Split into multiple paths (if/else, switch)
  DelayNode:    Wait for a duration before continuing
  LoopNode:     Iterate over an array of items
  CodeNode:     Execute custom JavaScript or Python
  SearchNode:   Query data from an integration

Edge Types:
  DefaultEdge:  Standard connection between steps
  ConditionalEdge: Shows condition label (true/false branches)
  ErrorEdge:    Error handling path (red, dashed)
```

### Canvas State Management (Zustand)

```typescript
interface WorkflowEditorStore {
  nodes: Node[];
  edges: Edge[];
  selectedNode: string | null;
  isDirty: boolean;
  workflowId: string;

  // Actions
  addNode: (type: NodeType, position: Position) => void;
  removeNode: (nodeId: string) => void;
  updateNodeConfig: (nodeId: string, config: Partial<StepConfig>) => void;
  connectNodes: (sourceId: string, targetId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  saveWorkflow: () => Promise<void>;
  publishWorkflow: () => Promise<void>;
  testWorkflow: (sampleData: any) => Promise<void>;
}
```

### Data Mapping UI

When configuring an action step, users map fields from trigger data or previous steps:

```
Source Field (autocomplete dropdown):
  {{trigger.data.email}}
  {{trigger.data.name}}
  {{steps.step_1.output.contact_id}}

Target Field (integration schema):
  HubSpot Contact → Email
  HubSpot Contact → First Name

Mapping supports:
  - Direct mapping (field to field)
  - Expression mapping: {{trigger.data.firstName}} {{trigger.data.lastName}}
  - Transformation: {{uppercase(trigger.data.email)}}
  - Static values: "New Lead"
  - Conditional: {{trigger.data.score > 80 ? "Hot" : "Cold"}}
```

---

## API Client Layer

### Authenticated Fetch Wrapper

```typescript
// lib/api/client.ts
const apiClient = {
  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = useAuthStore.getState().accessToken;

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Request-ID': generateRequestId(),
        ...options?.headers,
      },
    });

    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiClient.request<T>(endpoint, options);
      redirectToLogin();
    }

    if (!response.ok) throw new ApiError(response);
    return response.json();
  },
};
```

### TanStack Query Integration

```typescript
// lib/hooks/use-workflows.ts
export function useWorkflows(filters?: WorkflowFilters) {
  return useQuery({
    queryKey: ['workflows', filters],
    queryFn: () => workflowApi.list(filters),
    staleTime: 30_000,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
```

---

## Real-Time Updates (WebSocket)

### Use Cases

- Live execution status (running -> completed/failed)
- Step-by-step progress during test runs
- Collaborative editing indicators (future)
- System notifications

### Implementation

```typescript
// lib/hooks/use-websocket.ts
export function useExecutionUpdates(executionId: string) {
  const [status, setStatus] = useState<ExecutionStatus>('pending');
  const [steps, setSteps] = useState<StepUpdate[]>([]);

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BASE_URL}/ws/executions/${executionId}?token=${getAccessToken()}`
    );

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (update.type === 'execution.status') setStatus(update.status);
      if (update.type === 'step.completed') setSteps(prev => [...prev, update]);
    };

    return () => ws.close();
  }, [executionId]);

  return { status, steps };
}
```

---

## Authentication Flow (Frontend)

```
1. User visits app -> Next.js middleware checks for session cookie
2. No session -> Redirect to /login
3. User logs in -> POST /api/v1/auth/login
4. Server returns JWT + refresh token
5. JWT stored in memory (Zustand), refresh token in httpOnly cookie
6. Every API call includes Authorization: Bearer <jwt>
7. JWT expires (15 min) -> auto-refresh via interceptor
8. Refresh token expires (7 days) -> redirect to login
```

### Next.js Middleware

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const session = request.cookies.get('rf_session');
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');

  if (!session && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Design System

### Theme

```
Colors (CSS variables for dark/light mode):
  --primary: Blue (brand color)
  --secondary: Slate
  --success: Green (execution success)
  --warning: Amber (execution warning)
  --destructive: Red (execution failed)
  --muted: Gray (disabled states)

Typography:
  Font: Inter (variable font)
  Headings: 600 weight
  Body: 400 weight
  Mono: JetBrains Mono (code, execution logs)

Spacing: Tailwind default scale (4px base)
Border radius: 8px (default), 12px (cards), 16px (modals)

Dark mode: System preference with manual toggle
  Implemented via next-themes + Tailwind dark: prefix
```

### Component Categories

```
Primitives (shadcn/ui):
  Button, Input, Select, Dialog, Dropdown, Toast, Tooltip,
  Table, Tabs, Badge, Avatar, Card, Skeleton, Switch

Domain Components:
  WorkflowCard, ConnectionCard, ExecutionTimeline,
  IntegrationIcon, StepConfigPanel, DataMapper,
  CodeEditor, PayloadViewer, CronBuilder

Layout Components:
  Sidebar, Header, Breadcrumbs, PageContainer,
  EmptyState, LoadingSkeleton, ErrorBoundary
```

---

## Performance Optimization

### Code Splitting

- Each route is automatically code-split by Next.js App Router
- Heavy components lazy-loaded:
  - React Flow canvas (loaded only on workflow editor page)
  - Monaco Editor (loaded only when code step is selected)
  - Recharts (loaded only on dashboard page)

### Caching Strategy

```
TanStack Query cache:
  Workflows list:     staleTime: 30s, cacheTime: 5m
  Workflow detail:    staleTime: 10s, cacheTime: 5m
  Integrations list:  staleTime: 5m,  cacheTime: 30m (rarely changes)
  Execution logs:     staleTime: 0,   cacheTime: 1m (always fresh)
  User profile:       staleTime: 5m,  cacheTime: 30m
```

### Bundle Size Targets

```
First Load JS: < 150KB (gzipped)
Workflow Editor page: < 300KB (includes React Flow)
Time to Interactive: < 2 seconds
Largest Contentful Paint: < 1.5 seconds
```

---

## Testing Strategy

### Unit Tests (Vitest + Testing Library)

```
Target: 80% coverage on components and hooks
Focus:
  - Component rendering with various props
  - Hook behavior (state changes, API calls)
  - Utility functions
  - Form validation
```

### Integration Tests (Vitest)

```
Focus:
  - API client functions with MSW (Mock Service Worker)
  - Store actions and state transitions
  - Multi-component interactions
```

### E2E Tests (Playwright)

```
Critical paths:
  - Login / signup flow
  - Create workflow (end-to-end canvas interaction)
  - Connect integration (OAuth flow)
  - Execute workflow and view results
  - Team invitation flow
  - Billing upgrade flow
```

---

## Deployment

```
Build: next build (static + server components)
Output: Standalone (self-contained Node.js server)
Image: Docker (distroless Node.js base)
Hosting: K8s pods in river-flow-services namespace
CDN: CloudFront for static assets (_next/static/)
Environment variables: injected via External Secrets Operator
```
