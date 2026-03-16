# Feature PRD: AI Automation Layer

## Problem Statement

Building workflows requires understanding integrations, data schemas, and automation patterns. AI can dramatically reduce this friction by generating workflows from natural language, suggesting field mappings, recommending automations based on connected apps, and helping users debug failures. The AI layer makes River Flow accessible to everyone while making power users faster.

---

## User Stories

1. **As a non-technical user**, I want to describe an automation in plain English and have the platform build the workflow for me.
2. **As a user**, I want the platform to suggest how to map fields between my connected apps.
3. **As a user**, I want the platform to suggest useful automations based on which integrations I have connected.
4. **As a user**, I want AI to help me understand and fix workflow failures.

---

## AI Features

### 1. Natural Language Workflow Builder

```
User types:
  "When a new Stripe payment comes in, create a contact in HubSpot
   with the customer's email and name, then send a Slack message to
   the #sales channel with the payment amount"

AI generates:
  Workflow:
    Trigger: Stripe → New Payment
    Step 1: HubSpot → Create Contact
      Mapping: email = {{trigger.data.customer.email}}
               name = {{trigger.data.customer.name}}
    Step 2: Slack → Send Message
      Mapping: channel = #sales
               message = "New payment: ${{trigger.data.amount/100}} from {{trigger.data.customer.name}}"
```

### Implementation

```typescript
interface WorkflowGenerationRequest {
  prompt: string;
  available_connections: Connection[];  // User's connected integrations
  context?: {
    existing_workflows: WorkflowSummary[];
    recent_templates: string[];
  };
}

async function generateWorkflow(request: WorkflowGenerationRequest): Promise<GeneratedWorkflow> {
  const systemPrompt = buildSystemPrompt({
    available_integrations: request.available_connections.map(c => c.integration),
    integration_schemas: await loadSchemas(request.available_connections),
    workflow_examples: await loadExampleWorkflows(),
  });

  const response = await llm.chat({
    model: 'gpt-4o',  // or Claude, configurable
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.prompt },
    ],
    response_format: { type: 'json_schema', schema: workflowGenerationSchema },
    temperature: 0.2,
  });

  const generated = parseWorkflowDefinition(response);
  const validated = await validateGeneratedWorkflow(generated);
  return validated;
}
```

### UX Flow

```
1. User opens new workflow page
2. Option: "Describe your automation" (text input with examples)
3. User types description and presses Enter
4. Loading state: "Building your workflow..."
5. AI generates workflow definition
6. Workflow appears on canvas with all steps configured
7. User reviews:
   - Connections: "Connect your Stripe account" (if not connected)
   - Mappings: Review and adjust AI-suggested mappings
   - Additional settings: Channels, conditions, etc.
8. User modifies as needed
9. User clicks [Test] then [Activate]
```

---

### 2. AI Field Mapping

When a user creates an action step and selects the target integration, AI suggests field mappings.

```
Context:
  Source: Typeform response data
  Target: HubSpot Create Contact

AI analyzes field names, types, and sample data to suggest:
  ┌───────────────┬────────────────────────┬────────────┐
  │ Target Field  │ Suggested Mapping      │ Confidence │
  ├───────────────┼────────────────────────┼────────────┤
  │ email         │ trigger.data.email     │ 99%        │
  │ firstname     │ trigger.data.first_name│ 95%        │
  │ lastname      │ trigger.data.last_name │ 95%        │
  │ phone         │ trigger.data.phone     │ 90%        │
  │ company       │ trigger.data.company   │ 85%        │
  │ lead_source   │ "Typeform" (static)    │ 70%        │
  └───────────────┴────────────────────────┴────────────┘

User can accept all, modify, or dismiss suggestions.
```

### Implementation

```typescript
async function suggestFieldMappings(
  sourceSchema: FieldSchema[],
  targetSchema: FieldSchema[],
  sampleData?: Record<string, any>
): Promise<FieldMappingSuggestion[]> {
  // Layer 1: Exact name match (email -> email)
  const exactMatches = findExactMatches(sourceSchema, targetSchema);

  // Layer 2: Fuzzy name match (first_name -> firstname)
  const fuzzyMatches = findFuzzyMatches(sourceSchema, targetSchema);

  // Layer 3: Type-compatible matches (string -> string, number -> number)
  const typeMatches = findTypeCompatibleMatches(sourceSchema, targetSchema);

  // Layer 4: LLM for semantic matching (company_name -> organization)
  const semanticMatches = await llmSuggestMappings(sourceSchema, targetSchema, sampleData);

  return mergeAndRank([exactMatches, fuzzyMatches, typeMatches, semanticMatches]);
}
```

---

### 3. Automation Suggestions

When a user connects a new integration, the platform suggests relevant automations.

```
User connects Salesforce:

Suggestions panel appears:
  "Based on your connected apps, try these automations:"

  1. Salesforce → Slack
     "Notify #sales when a new deal is created"
     [Use Template]

  2. Salesforce → Google Sheets
     "Log all new contacts to a spreadsheet"
     [Use Template]

  3. Stripe → Salesforce
     "Create Salesforce contact on new Stripe payment"
     [Use Template]
```

### Implementation

```typescript
async function generateSuggestions(tenantId: string): Promise<AutomationSuggestion[]> {
  const connections = await getActiveConnections(tenantId);
  const existingWorkflows = await getWorkflows(tenantId);
  const popularTemplates = await getPopularTemplates(connections.map(c => c.integration_id));

  // Filter out templates for workflows the user already has
  const unusedTemplates = filterAlreadyImplemented(popularTemplates, existingWorkflows);

  // Rank by: popularity * relevance * recency of connection
  return rankSuggestions(unusedTemplates, connections);
}
```

---

### 4. AI Error Diagnosis

When an execution fails, AI analyzes the error and suggests fixes.

```
Execution #846 failed at Step 2: Create Salesforce Contact
Error: 401 Unauthorized - INVALID_SESSION_ID

AI Analysis:
  "Your Salesforce connection session has expired. This typically happens
   when the refresh token is revoked or the connected user's password was
   changed. Re-authenticate your Salesforce connection to fix this."

  Suggested actions:
  [Re-connect Salesforce] [Retry Execution]
```

### Implementation

```typescript
async function diagnoseError(execution: Execution, step: ExecutionStep): Promise<ErrorDiagnosis> {
  const context = {
    step_type: step.step_type,
    integration: step.integration_name,
    error_message: step.error_message,
    http_status: step.http_status_code,
    request_url: step.request_url,
    recent_similar_errors: await findSimilarErrors(step),
    integration_status: await checkIntegrationHealth(step.integration_id),
  };

  const diagnosis = await llm.chat({
    model: 'gpt-4o-mini',  // Lighter model for error analysis
    messages: [
      { role: 'system', content: errorDiagnosisPrompt },
      { role: 'user', content: JSON.stringify(context) },
    ],
    response_format: { type: 'json_schema', schema: diagnosisSchema },
  });

  return {
    explanation: diagnosis.explanation,
    root_cause: diagnosis.root_cause,
    suggested_actions: diagnosis.actions,
    confidence: diagnosis.confidence,
  };
}
```

---

## LLM Integration Architecture

### Provider Abstraction

```typescript
interface LLMProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  embed(text: string): Promise<number[]>;
}

class OpenAIProvider implements LLMProvider { ... }
class AnthropicProvider implements LLMProvider { ... }
class SelfHostedProvider implements LLMProvider { ... }

// Factory based on configuration
const llm = createLLMProvider(config.ai.provider);
```

### Cost Management

| Feature                    | Model           | Estimated Cost per Request |
| -------------------------- | --------------- | -------------------------- |
| Workflow generation        | GPT-4o          | ~$0.02-0.05               |
| Field mapping suggestions  | GPT-4o-mini     | ~$0.001                    |
| Error diagnosis            | GPT-4o-mini     | ~$0.001                    |
| Automation suggestions     | Embedding + DB  | ~$0.0001                   |

### Rate Limiting AI Features

```
Free plan:     5 AI generations/month
Starter plan:  50 AI generations/month
Pro plan:      500 AI generations/month
Enterprise:    Unlimited (BYO API key option)
```

---

## Data Privacy

```
Principles:
  - User data sent to LLM is minimal (schemas and field names, not actual data values)
  - Sample data used for mapping is synthetic or explicitly consented
  - No customer data is used for model training
  - Enterprise customers can opt for self-hosted LLM (e.g., llama, mistral)
  - All AI requests are logged in audit trail
  - Users can disable AI features entirely
```

---

## Implementation Phases

### Phase 1 (MVP)
- AI field mapping suggestions (deterministic matching + simple LLM call)
- Error diagnosis for common failure patterns (rule-based first)

### Phase 2
- Natural language workflow builder (LLM-powered)
- Automation suggestions based on connected integrations
- AI-generated workflow descriptions

### Phase 3
- AI error diagnosis with LLM
- Conversational workflow editing ("Add a filter that only allows scores above 80")
- Smart defaults for step configuration

### Phase 4
- Self-hosted LLM support for enterprise
- AI-generated connectors from API documentation
- Anomaly detection on execution patterns
- Predictive failure alerting
