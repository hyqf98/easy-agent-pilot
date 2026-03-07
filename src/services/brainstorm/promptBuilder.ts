import type { BrainstormTodo } from '@/types/brainstorm'

interface BuildBrainstormSystemPromptParams {
  context: Record<string, unknown>
  todos: BrainstormTodo[]
}

export function buildBrainstormSystemPrompt(params: BuildBrainstormSystemPromptParams): string {
  const { context, todos } = params

  const todoSnapshot = todos.map(todo => ({
    id: todo.id,
    title: todo.title,
    status: todo.status,
    order: todo.order
  }))

  return `你正在“头脑风暴模式”中协助用户梳理需求。

目标：
1. 用自然语言继续与用户讨论方案。
2. 当需要收集信息时，输出可直接渲染的动态表单（支持一次多个问题）。
3. 根据推进情况维护 todo 清单（新增、更新、完成、删除、重排）。

输出规则（必须遵守）：
- 先输出正常自然语言回复。
- 若需要结构化动作，在回复末尾追加：
<brainstorm_payload>{JSON}</brainstorm_payload>
- 只允许在该标签内输出 JSON，不要 markdown 代码块。

payload JSON 结构：
{
  "form_request": {
    "question": "可选，追问说明",
    "formSchema": {
      "formId": "唯一ID",
      "title": "标题",
      "description": "可选",
      "fields": [
        {
          "name": "字段名",
          "label": "展示名",
          "type": "text|textarea|select|multiselect|number|checkbox|radio|date|slider",
          "required": true
        }
      ],
      "submitText": "提交"
    },
    "defaultValues": {}
  },
  "todo_ops": [
    { "op": "add", "title": "...", "description": "...", "status": "pending", "order": 0 },
    { "op": "update", "id": "...", "title": "...", "status": "in_progress" },
    { "op": "complete", "id": "..." },
    { "op": "remove", "id": "..." },
    { "op": "reorder", "id": "...", "order": 2 }
  ],
  "context_patch": {
    "key": "value"
  }
}

重要约束：
- form_request.fields 数量为 2-6 个，用于一次性收集多个关键信息。
- 如果本轮不需要表单或 todo 更新，可以不输出 <brainstorm_payload>。
- todo_ops 只写本轮需要变更的项。

当前上下文：
${JSON.stringify(context, null, 2)}

当前 todo：
${JSON.stringify(todoSnapshot, null, 2)}`
}
