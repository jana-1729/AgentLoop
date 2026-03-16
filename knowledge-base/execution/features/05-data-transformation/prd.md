# Feature PRD: Data Transformation Layer

## Problem Statement

Data flowing between applications rarely has matching schemas. A CRM contact's "first_name" field must map to a marketing tool's "firstName". Dates need reformatting, numbers need converting, and strings need parsing. The transformation layer provides built-in utilities, an expression engine, and sandboxed code execution so users can reshape data between workflow steps.

---

## User Stories

1. **As a no-code user**, I want built-in functions to format text, dates, and numbers without writing code.
2. **As a user**, I want to write expressions in field mappings to combine, transform, or conditionally set field values.
3. **As a developer**, I want to write JavaScript or Python code in a workflow step for complex transformations.
4. **As a user**, I want to parse JSON strings, split text, and extract values from structured data.

---

## Expression Engine

### Template Syntax

All field mappings support template expressions wrapped in `{{ }}`:

```
Simple reference:     {{trigger.data.email}}
String concatenation: {{trigger.data.firstName}} {{trigger.data.lastName}}
Function call:        {{uppercase(trigger.data.email)}}
Conditional:          {{trigger.data.score > 80 ? "Hot" : "Cold"}}
Nested access:        {{steps.step_1.output.contacts[0].email}}
Default value:        {{trigger.data.company || "Unknown"}}
```

### Built-in Functions

#### Text Functions

| Function                        | Description                          | Example                                      |
| ------------------------------- | ------------------------------------ | -------------------------------------------- |
| `uppercase(str)`                | Convert to uppercase                 | `{{uppercase("hello")}}` → `HELLO`          |
| `lowercase(str)`                | Convert to lowercase                 | `{{lowercase("Hello")}}` → `hello`          |
| `capitalize(str)`               | Capitalize first letter              | `{{capitalize("hello world")}}` → `Hello world` |
| `titleCase(str)`                | Title case                           | `{{titleCase("hello world")}}` → `Hello World` |
| `trim(str)`                     | Remove leading/trailing whitespace   | `{{trim("  hi  ")}}` → `hi`                |
| `split(str, delimiter)`         | Split into array                     | `{{split("a,b,c", ",")}}` → `["a","b","c"]`|
| `join(arr, delimiter)`          | Join array into string               | `{{join(["a","b"], ", ")}}` → `a, b`        |
| `replace(str, find, replace)`   | Replace substring                    | `{{replace("hello", "l", "r")}}` → `herro` |
| `substring(str, start, end)`    | Extract substring                    | `{{substring("hello", 0, 3)}}` → `hel`     |
| `length(str)`                   | String length                        | `{{length("hello")}}` → `5`                |
| `contains(str, search)`         | Check if contains                    | `{{contains("hello", "ell")}}` → `true`    |
| `startsWith(str, prefix)`       | Check prefix                         | `{{startsWith("hello", "he")}}` → `true`   |
| `slugify(str)`                  | URL-safe slug                        | `{{slugify("Hello World")}}` → `hello-world`|
| `truncate(str, maxLen)`         | Truncate with ellipsis               | `{{truncate("long text", 5)}}` → `lon...`  |
| `extractEmail(str)`             | Extract email from text              | Regex-based extraction                       |
| `extractUrl(str)`               | Extract URL from text                | Regex-based extraction                       |
| `md5(str)`                      | MD5 hash                             | For dedup or checksums                       |
| `base64Encode(str)`             | Base64 encode                        | For API payloads                             |
| `base64Decode(str)`             | Base64 decode                        | For API responses                            |

#### Number Functions

| Function                        | Description                          | Example                                      |
| ------------------------------- | ------------------------------------ | -------------------------------------------- |
| `round(num, decimals)`          | Round number                         | `{{round(3.14159, 2)}}` → `3.14`           |
| `floor(num)`                    | Round down                           | `{{floor(3.7)}}` → `3`                     |
| `ceil(num)`                     | Round up                             | `{{ceil(3.2)}}` → `4`                      |
| `abs(num)`                      | Absolute value                       | `{{abs(-5)}}` → `5`                        |
| `min(a, b)`                     | Minimum value                        | `{{min(3, 7)}}` → `3`                      |
| `max(a, b)`                     | Maximum value                        | `{{max(3, 7)}}` → `7`                      |
| `toNumber(str)`                 | Parse string to number               | `{{toNumber("42")}}` → `42`                |
| `formatCurrency(num, currency)` | Format as currency                   | `{{formatCurrency(1234.5, "USD")}}` → `$1,234.50` |
| `percentage(num, total)`        | Calculate percentage                 | `{{percentage(25, 200)}}` → `12.5`         |

#### Date Functions

| Function                                | Description                 | Example                                   |
| --------------------------------------- | --------------------------- | ----------------------------------------- |
| `now()`                                 | Current timestamp (ISO)     | `2026-03-15T10:30:00Z`                   |
| `formatDate(date, format)`              | Format date                 | `{{formatDate(now(), "YYYY-MM-DD")}}`     |
| `parseDate(str, format)`                | Parse date string           | `{{parseDate("15/03/2026", "DD/MM/YYYY")}}` |
| `addDays(date, n)`                      | Add days                    | `{{addDays(now(), 7)}}`                   |
| `addHours(date, n)`                     | Add hours                   | `{{addHours(now(), 24)}}`                 |
| `subtractDays(date, n)`                 | Subtract days               | `{{subtractDays(now(), 30)}}`             |
| `diffDays(date1, date2)`               | Difference in days          | `{{diffDays(date1, date2)}}` → `15`      |
| `toTimestamp(date)`                     | Convert to Unix timestamp   | `{{toTimestamp(now())}}` → `1710500000`   |
| `fromTimestamp(num)`                    | Convert from Unix timestamp | ISO date string                            |
| `dayOfWeek(date)`                       | Get day name                | `{{dayOfWeek(now())}}` → `Sunday`        |
| `toTimezone(date, tz)`                  | Convert timezone            | `{{toTimezone(now(), "America/New_York")}}` |

#### Object/Array Functions

| Function                        | Description                          | Example                                      |
| ------------------------------- | ------------------------------------ | -------------------------------------------- |
| `get(obj, path)`                | Get nested value (dot notation)      | `{{get(data, "user.address.city")}}`        |
| `keys(obj)`                     | Get object keys                      | `{{keys(data)}}` → `["a", "b"]`            |
| `values(obj)`                   | Get object values                    | `{{values(data)}}` → `[1, 2]`              |
| `merge(obj1, obj2)`             | Merge objects                        | `{{merge(defaults, overrides)}}`             |
| `pick(obj, keys)`               | Pick specific keys                   | `{{pick(data, ["name", "email"])}}`         |
| `omit(obj, keys)`               | Omit specific keys                   | `{{omit(data, ["password"])}}`              |
| `first(arr)`                    | First array element                  | `{{first(items)}}` → first item            |
| `last(arr)`                     | Last array element                   | `{{last(items)}}` → last item              |
| `filter(arr, field, value)`     | Filter array by field value          | `{{filter(items, "status", "active")}}`     |
| `map(arr, field)`               | Extract field from each item         | `{{map(contacts, "email")}}` → email list  |
| `count(arr)`                    | Array length                         | `{{count(items)}}` → `5`                   |
| `unique(arr)`                   | Remove duplicates                    | `{{unique([1,2,2,3])}}` → `[1,2,3]`       |
| `sort(arr, field, dir)`         | Sort array                           | `{{sort(items, "date", "desc")}}`           |
| `flatten(arr)`                  | Flatten nested arrays                | `{{flatten([[1,2],[3,4]])}}` → `[1,2,3,4]` |

#### Logic Functions

| Function                        | Description                          | Example                                      |
| ------------------------------- | ------------------------------------ | -------------------------------------------- |
| `if(cond, then, else)`          | Conditional                          | `{{if(score > 80, "Hot", "Cold")}}`         |
| `isEmpty(val)`                  | Check if null/undefined/empty string | `{{isEmpty(data.name)}}` → `true/false`    |
| `coalesce(a, b, c)`             | First non-null value                 | `{{coalesce(data.name, data.email, "N/A")}}`|
| `typeOf(val)`                   | Get type name                        | `{{typeOf(42)}}` → `number`                |
| `toJson(val)`                   | Serialize to JSON string             | `{{toJson(data)}}`                           |
| `parseJson(str)`                | Parse JSON string to object          | `{{parseJson('{"a":1}')}}`                  |

---

## Expression Engine Implementation

```typescript
import { evaluate } from './expression-evaluator';

function resolveTemplate(template: string, context: ExecutionContext): any {
  if (typeof template !== 'string') return template;

  // Check if entire value is a single expression (return typed value)
  const singleExprMatch = template.match(/^\{\{(.+)\}\}$/s);
  if (singleExprMatch) {
    return evaluate(singleExprMatch[1].trim(), context);
  }

  // Otherwise, interpolate expressions within string
  return template.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
    const result = evaluate(expr.trim(), context);
    return result != null ? String(result) : '';
  });
}
```

The expression evaluator uses a safe subset of JavaScript (no access to global objects, no function constructors, no eval). Implemented with a custom AST parser or a sandboxed evaluator library.

---

## Code Execution Steps

### JavaScript (V8 Isolates)

```typescript
// User writes:
async function run(input) {
  const domain = input.email.split('@')[1];
  const isBusinessEmail = !['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain);
  return {
    domain,
    is_business: isBusinessEmail,
    processed_at: new Date().toISOString(),
  };
}

// Platform executes:
import ivm from 'isolated-vm';

async function executeJavaScript(code: string, input: object): Promise<object> {
  const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128MB limit
  const context = await isolate.createContext();

  // Inject input as frozen global
  const inputRef = new ivm.ExternalCopy(input).copyInto();
  await context.global.set('__input', inputRef);

  // Execute with timeout
  const script = await isolate.compileScript(`
    const __result = (${code})(__input);
    __result;
  `);

  const result = await script.run(context, { timeout: 10_000 }); // 10s timeout
  isolate.dispose();

  return result;
}
```

### Python (Firecracker microVM)

```python
# User writes:
def run(input):
    import re
    emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.]+', input['text'])
    return {
        'emails': emails,
        'count': len(emails)
    }
```

Executed in a Firecracker microVM with:
- Pre-built rootfs with Python 3.11 + common libraries (requests, json, re, datetime)
- Input passed via stdin (JSON serialized)
- Output captured from stdout (JSON serialized)
- Strict resource limits (CPU, memory, time, no network)

---

## Data Type Coercion

When data flows between steps, types may need automatic conversion:

| Source Type | Target Type | Coercion Rule                        |
| ----------- | ----------- | ------------------------------------ |
| string      | number      | `parseFloat(value)` or error         |
| number      | string      | `String(value)`                      |
| string      | boolean     | `"true"/"1"/"yes"` → true           |
| boolean     | string      | `"true"` / `"false"`                |
| string      | date        | ISO 8601 parse                       |
| date        | string      | ISO 8601 format                      |
| null        | string      | `""` (empty string)                  |
| null        | number      | `0`                                  |
| array       | string      | JSON.stringify                       |
| string      | array       | JSON.parse (if valid JSON)           |

---

## Implementation Phases

### Phase 1 (MVP)
- Simple field mapping (direct field reference)
- Basic expression syntax (`{{trigger.data.field}}`)
- String concatenation in templates
- Type coercion (string <-> number, string <-> boolean)

### Phase 2
- Built-in text, number, and date functions
- Conditional expressions (ternary operator)
- Default values (coalesce/null fallback)
- JSONPath access for nested data

### Phase 3
- JavaScript code steps (V8 isolates)
- Array/object functions (filter, map, sort)
- Expression editor with autocomplete in the UI
- Preview: show resolved values with sample data

### Phase 4
- Python code steps (Firecracker)
- AI-assisted data mapping (suggest field mappings)
- Custom reusable functions (define once, use across workflows)
- Data validation step (validate data against a JSON schema)
