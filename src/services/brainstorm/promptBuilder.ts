import type { BrainstormTodo } from '@/types/brainstorm'

interface BuildBrainstormSystemPromptParams {
  context: Record<string, unknown>
  todos: BrainstormTodo[]
}

const JSON_SCHEMA_EXAMPLE = `{
  "formRequest": {
    "question": "Optional follow-up question",
    "formSchema": {
      "formId": "unique-id",
      "title": "Form Title",
      "description": "Optional description",
      "fields": [
        {
          "name": "fieldName",
          "label": "Field Label",
          "type": "text",
          "required": true,
          "placeholder": "Optional",
          "options": [{"label": "Label", "value": "value"}],
          "validation": {"min": 1, "max": 10, "message": "Validation message"}
        }
      ],
      "submitText": "Submit"
    },
    "defaultValues": {}
  },
  "todoOps": [
    { "op": "add", "title": "Task Title", "description": "Task Description", "status": "pending", "order": 0 },
    { "op": "update", "id": "task-id", "title": "New Title", "status": "in_progress" },
    { "op": "complete", "id": "task-id" },
    { "op": "remove", "id": "task-id" },
    { "op": "reorder", "id": "task-id", "order": 2 }
  ],
  "contextPatch": {
    "key": "value"
  }
}`

export function buildBrainstormSystemPrompt(params: BuildBrainstormSystemPromptParams): string {
  const { context, todos } = params

  const todoSnapshot = todos.map(todo => ({
    id: todo.id,
    title: todo.title,
    status: todo.status,
    order: todo.order
  }))

  return `You are assisting the user in "Brainstorm Mode" to clarify requirements.

Goals:
1. Continue discussing the solution with the user in natural language.
2. When information collection is needed, output a dynamic form (supports multiple questions at once).
3. Maintain the todo list based on progress (add, update, complete, remove, reorder).

## Output Rules (Must Strictly Follow)

### Basic Format
- First output normal natural language response.
- If structured action is needed, **append** at the end of response:
  <brainstorm_payload>{JSON}</brainstorm_payload>
- **DO NOT** use markdown code blocks inside the tag (no \`\`\`json).
- **DO NOT** add any explanatory text before or after the tag.

### JSON Structure Definition
The payload must be a valid JSON object with the following structure:

${JSON_SCHEMA_EXAMPLE}

### Important Constraints
1. **Form Field Count**: fields array should contain 2-6 fields for collecting multiple key information at once.
2. **Optional Output**: If no form or todo updates are needed this round, you can skip the <brainstorm_payload>.
3. **Incremental Update**: todoOps only contains items that need to change this round, no need to list all todos.
4. **Field Types**: type must be one of text/textarea/select/multiselect/number/checkbox/radio/date/slider.
5. **Options Field**: select/multiselect/radio types must provide an options array.

### Wrong Examples (Forbidden)
Using markdown code block (forbidden):
<brainstorm_payload>
\`\`\`json
{"formRequest": {...}}
\`\`\`
</brainstorm_payload>

Adding extra text (forbidden):
Here is the form data:
<brainstorm_payload>{"formRequest": {...}}</brainstorm_payload>

### Correct Example
Pure JSON inside the tag:
Okay, I need to know more information:
<brainstorm_payload>{"formRequest":{"formSchema":{"formId":"step1","title":"Requirement Confirmation","fields":[{"name":"feature","label":"Core Feature","type":"text","required":true}]}}}</brainstorm_payload>

---

## Current Context
${JSON.stringify(context, null, 2)}

## Current Todo List
${JSON.stringify(todoSnapshot, null, 2)}`
}
