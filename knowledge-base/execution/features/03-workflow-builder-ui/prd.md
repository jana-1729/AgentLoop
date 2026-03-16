# Feature PRD: Workflow Builder UI

## Problem Statement

No-code users need a visual, drag-and-drop interface to build multi-step workflows without writing code. The builder must be intuitive for non-technical users while powerful enough for developers. It must provide real-time feedback, data mapping capabilities, test execution, and clear error indicators.

---

## User Stories

1. **As a no-code user**, I want to drag trigger and action blocks onto a canvas and connect them visually, so I can build automations without coding.
2. **As a user**, I want to map fields between apps using a visual dropdown interface that shows available fields from previous steps.
3. **As a user**, I want to test my workflow with sample data before activating it, so I can verify it works correctly.
4. **As a user**, I want to see clear error indicators on steps that are misconfigured, so I know what to fix.
5. **As a developer**, I want to write custom code in a step using an in-browser editor with syntax highlighting and autocomplete.

---

## Builder Components

### Canvas (React Flow)

The main workspace where users build workflows visually.

```
┌─────────────────────────────────────────────────────┐
│  Toolbar: [+ Add Step] [Test] [Publish] [Settings]  │
├──────────────────┬──────────────────────────────────┤
│                  │                                   │
│   Step Palette   │        WORKFLOW CANVAS             │
│                  │                                   │
│  ┌────────────┐  │     ┌──────────┐                  │
│  │ Trigger    │  │     │ Webhook  │ (trigger)         │
│  ├────────────┤  │     │ Trigger  │                  │
│  │ Action     │  │     └────┬─────┘                  │
│  ├────────────┤  │          │                        │
│  │ Filter     │  │     ┌────▼─────┐                  │
│  ├────────────┤  │     │ Create   │ (action)         │
│  │ Branch     │  │     │ Contact  │                  │
│  ├────────────┤  │     └────┬─────┘                  │
│  │ Loop       │  │          │                        │
│  ├────────────┤  │     ┌────▼─────┐                  │
│  │ Delay      │  │     │  Send    │ (action)         │
│  ├────────────┤  │     │  Slack   │                  │
│  │ Code       │  │     └──────────┘                  │
│  ├────────────┤  │                                   │
│  │ Search     │  │                                   │
│  └────────────┘  │                                   │
├──────────────────┴──────────────────────────────────┤
│  Configuration Panel (appears when node selected)    │
│  [Integration] [Action] [Field Mapping] [Test Step]  │
└─────────────────────────────────────────────────────┘
```

### Node Types

Each step type has a distinct visual node:

| Node          | Visual Cues                           | Color      |
| ------------- | ------------------------------------- | ---------- |
| Trigger       | Lightning bolt icon, rounded top      | Blue       |
| Action        | Integration icon, square              | Slate      |
| Filter        | Funnel icon, diamond shape            | Amber      |
| Branch        | Split arrows, hexagon                 | Purple     |
| Loop          | Cycle icon, rounded                   | Teal       |
| Delay         | Clock icon, dashed border             | Gray       |
| Code          | Brackets icon `</>`, terminal style   | Green      |
| Search        | Magnifying glass, square              | Indigo     |

Each node displays:
- Integration icon (if applicable)
- Step name/title
- Brief description or action type
- Status indicator (configured / error / testing)
- Connection handles (top input, bottom output)

### Edge Types

```
DefaultEdge:      Solid line with arrow
ConditionalEdge:  Solid line with label badge ("Score > 80", "true/false")
ErrorEdge:        Dashed red line (connects to error handler)
```

---

## Configuration Panel

When a user clicks a node, a side panel opens with step-specific configuration.

### Trigger Configuration

```
┌─────────────────────────────────┐
│  Configure Trigger              │
│                                 │
│  Trigger Type:                  │
│  [Webhook ▼]                    │
│                                 │
│  Webhook URL:                   │
│  https://hooks.riverflow.io/... │
│  [Copy URL]                     │
│                                 │
│  -- OR --                       │
│                                 │
│  App Trigger:                   │
│  [Salesforce ▼]                 │
│  [New Contact Created ▼]        │
│  Connection: [My Salesforce ▼]  │
│                                 │
│  Sample Data:                   │
│  { "email": "test@example.com"} │
│  [Load Sample] [Edit Sample]    │
└─────────────────────────────────┘
```

### Action Configuration

```
┌─────────────────────────────────┐
│  Configure Action               │
│                                 │
│  Integration: [HubSpot ▼]      │
│  Action: [Create Contact ▼]    │
│  Connection: [My HubSpot ▼]    │
│                                 │
│  Field Mapping:                 │
│  ┌───────────┬────────────────┐ │
│  │ HubSpot   │ Source         │ │
│  │ Field     │ Field          │ │
│  ├───────────┼────────────────┤ │
│  │ Email     │ {{trigger.     │ │
│  │           │   data.email}} │ │
│  ├───────────┼────────────────┤ │
│  │ FirstName │ {{trigger.     │ │
│  │           │   data.name}}  │ │
│  ├───────────┼────────────────┤ │
│  │ Source    │ "Web Form"     │ │
│  └───────────┴────────────────┘ │
│  [+ Add Mapping]                │
│                                 │
│  [Test This Step]               │
└─────────────────────────────────┘
```

### Data Mapping System

The mapping UI is a critical UX component:

```
Source field input:
  1. Click input field
  2. Dropdown appears with data tree:
     ├── Trigger Data
     │   ├── email (string)
     │   ├── name (string)
     │   └── score (number)
     ├── Step 1: Create Contact (output)
     │   ├── contact_id (string)
     │   └── created_at (date)
     └── Custom Expression...

  3. User selects a field or types a custom expression
  4. Preview shows resolved value based on sample data
```

Features:
- Autocomplete with field type indicators (string, number, date, boolean)
- Live preview of resolved values using test data
- Expression mode: type `{{` to enter expression editing with autocomplete
- Transformation functions: `{{uppercase(trigger.data.email)}}`
- Static value input: just type a plain value

### Filter/Branch Configuration

```
┌─────────────────────────────────┐
│  Configure Filter               │
│                                 │
│  Continue only if:              │
│                                 │
│  Field: [{{trigger.data.score}}]│
│  Operator: [greater than ▼]     │
│  Value: [80]                    │
│                                 │
│  [+ Add AND condition]          │
│  [+ Add OR group]               │
│                                 │
│  Preview: trigger.data.score    │
│  = 85 → PASS                    │
└─────────────────────────────────┘
```

### Code Step Configuration

```
┌─────────────────────────────────┐
│  Configure Code Step            │
│                                 │
│  Language: [JavaScript ▼]       │
│                                 │
│  Input Variables:               │
│  email = {{trigger.data.email}} │
│  name = {{trigger.data.name}}   │
│                                 │
│  ┌─────────────────────────────┐│
│  │ // Monaco Editor            ││
│  │ async function run(input) { ││
│  │   const domain =            ││
│  │     input.email.split('@')  ││
│  │     [1];                    ││
│  │   return {                  ││
│  │     domain,                 ││
│  │     is_business:            ││
│  │       !['gmail.com',        ││
│  │         'yahoo.com']        ││
│  │       .includes(domain)     ││
│  │   };                        ││
│  │ }                           ││
│  └─────────────────────────────┘│
│                                 │
│  [Test Code] [Output Schema]    │
└─────────────────────────────────┘
```

---

## Test Mode

Users can test workflows before activating them.

### Test Workflow

```
1. User clicks [Test] in toolbar
2. Test panel opens at bottom of canvas
3. User provides sample trigger data (JSON editor or form)
4. Click [Run Test]
5. Workflow executes in real-time:
   - Each node lights up as it executes (blue pulse)
   - Success: green checkmark on node
   - Failure: red X on node
   - Skipped (filter): gray dimmed node
6. Step-by-step results appear in test panel
7. User can click any step to see input/output data
```

### Test Single Step

```
1. User right-clicks a node → "Test this step"
2. Input data auto-populated from previous step's sample output
3. Step executes against real integration
4. Output displayed in test panel
```

---

## Workflow Validation

Before publishing, the builder validates the workflow:

| Validation Rule                              | Error Message                               |
| -------------------------------------------- | ------------------------------------------- |
| Workflow has no trigger                       | "Add a trigger to start your workflow"      |
| Trigger is not configured                    | "Configure your trigger step"               |
| Action step has no integration selected      | "Select an integration for this step"       |
| Action step has no connection                | "Connect your {integration} account"        |
| Required mapping fields are empty            | "Map the required field: {field_name}"      |
| Branch has no conditions defined             | "Add at least one condition to your branch" |
| Loop has no items source                     | "Select which data to loop through"         |
| Code step has syntax errors                  | "Fix syntax error on line {N}"              |
| Disconnected nodes (no edges leading to them)| "Connect this step to the workflow"         |
| Circular reference detected                  | "Remove the circular connection"            |

Errors shown as:
- Red border on affected nodes
- Error badge with count in toolbar
- Error list in a validation panel

---

## State Management

### Zustand Store for Editor

```typescript
interface WorkflowEditorState {
  // Workflow metadata
  workflowId: string;
  workflowName: string;
  status: 'draft' | 'active' | 'paused';
  isDirty: boolean;

  // Canvas state
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;

  // Test state
  isTestRunning: boolean;
  testResults: Map<string, StepTestResult>;
  testTriggerData: Record<string, any>;

  // Validation
  validationErrors: ValidationError[];
}
```

### Auto-Save

The builder auto-saves the workflow draft every 10 seconds when changes are detected:

```
User edits → isDirty = true → debounce 10s → PATCH /workflows/:id → isDirty = false
```

Auto-save only updates the draft. Publishing is an explicit action.

---

## Responsive Design

### Desktop (> 1024px)
- Full canvas with side palette and configuration panel
- Three-column layout: palette | canvas | config panel

### Tablet (768px - 1024px)
- Canvas fills screen
- Palette accessible via floating action button
- Config panel as slide-over from right

### Mobile (< 768px)
- Workflow builder is view-only on mobile
- Users can view workflow structure and execution history
- Editing requires desktop (show prompt to switch)

---

## Keyboard Shortcuts

| Shortcut       | Action                    |
| -------------- | ------------------------- |
| Cmd/Ctrl + S   | Save draft                |
| Cmd/Ctrl + Z   | Undo                      |
| Cmd/Ctrl + Y   | Redo                      |
| Delete         | Delete selected node      |
| Cmd/Ctrl + D   | Duplicate selected node   |
| Cmd/Ctrl + Enter | Test workflow           |
| Escape         | Deselect / close panel    |
| Space + drag   | Pan canvas                |
| Scroll         | Zoom in/out               |
| Cmd/Ctrl + +/- | Zoom in/out              |
| Cmd/Ctrl + 0   | Fit to view               |

---

## Implementation Phases

### Phase 1 (MVP)
- Basic canvas with trigger, action, and filter nodes
- Simple data mapping (field dropdown, static values)
- Test workflow with sample data
- Auto-save drafts
- Basic validation

### Phase 2
- Branch and delay nodes
- Expression editor with autocomplete
- Code step with Monaco Editor (JS only)
- Undo/redo
- Keyboard shortcuts

### Phase 3
- Loop node
- Advanced data mapping (transformation functions, conditional values)
- Test single step
- Workflow templates (start from template)
- Mobile view-only mode

### Phase 4
- Collaborative editing (multiple users, presence indicators)
- AI-assisted workflow building (natural language to workflow)
- Custom themes (dark/light mode)
- Minimap navigation for large workflows
- Workflow diffing (compare versions visually)
