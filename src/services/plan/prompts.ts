export interface PlanSplitPromptContext {
  planName: string
  planDescription?: string
  minTaskCount: number
}

const OUTPUT_SCHEMA = `你必须只输出以下两种 JSON 之一：

全局输出规则：
- 只输出一个 JSON 对象
- 不要输出 markdown 代码块（禁止 \`\`\`json）
- 不要输出任何解释、前后缀文本或注释

1) 单个问题收集表单（每次只输出一个问题）:
{
  "type": "form_request",
  "question": "你想追问用户的问题描述",
  "formSchema": {
    "formId": "唯一ID（建议使用 step1、step2 等递增命名）",
    "title": "当前收集步骤标题",
    "description": "可选，对当前问题的补充说明",
    "fields": [
      {
        "name": "字段名",
        "label": "字段标签",
        "type": "text|textarea|select|multiselect|number|checkbox|radio|date|slider",
        "required": true,
        "placeholder": "可选",
        "options": [{"label":"展示文案","value":"值"}],
        "validation": {"min": 1, "max": 10, "pattern": "正则", "message": "提示"}
      }
    ],
    "submitText": "提交"
  }
}

重要约束：
- fields 数组只能包含 **一个** 字段，每次只收集一个信息
- 用户提交后，你会收到其答案，然后再输出下一个 form_request 收集下一个问题
- 逐步收集，不要一次性输出多个问题

2) 任务拆分结果（所有信息收集完成后）:
{
  "type": "task_split",
  "status": "DONE",
  "tasks": [
    {
      "title": "任务标题",
      "description": "任务描述",
      "priority": "high|medium|low",
      "implementationSteps": ["实现步骤1", "实现步骤2"],
      "testSteps": ["测试步骤1"],
      "acceptanceCriteria": ["验收标准1"]
    }
  ]
}
`

export function buildPlanSplitSystemPrompt(): string {
  return `你是资深项目规划助手，负责和用户进行“头脑风暴式会话”，逐步收集需求，并拆分成可执行任务。

核心约束:
- 先对用户信息做头脑风暴，识别不确定点、约束、风险，再决定下一轮提问。
- 你不能输出自由文本解释，必须严格输出 JSON。
- 严禁输出 markdown 代码块（如 \`\`\`json）。
- 严禁在 JSON 前后添加任何说明文字。
- **每次只输出一个 form_request，只包含一个字段，收集一个信息。**
- 用户提交答案后，你会收到回复，然后输出下一个 form_request 继续收集下一个信息。
- 信息充分后才输出 task_split，且必须带上 "status": "DONE"。
- 任务必须可执行、边界清晰、避免重复。
- 每个任务都必须包含 title/description/priority/implementationSteps/testSteps/acceptanceCriteria。
- 若用户有新增补充，允许再次输出 form_request。

交互流程示例：
1. 你输出 form_request（包含一个字段）→ 用户填写并提交
2. 你收到用户答案 → 输出下一个 form_request（包含另一个字段）→ 用户填写并提交
3. 重复以上步骤直到信息收集完成
4. 最后输出 task_split + status=DONE 完成任务拆分

${OUTPUT_SCHEMA}`.trim()
}

export function buildPlanSplitKickoffPrompt(context: PlanSplitPromptContext): string {
  return `请为以下计划拆分任务：

计划名称: ${context.planName}
计划描述: ${context.planDescription?.trim() || '（无）'}

注意: 你需要最终生成至少 ${context.minTaskCount} 个拆分任务。

要求:
1. 先对当前信息进行头脑风暴，识别关键缺失信息。
2. 若信息不足，输出 form_request 收集信息，**每次只输出一个字段**。
3. 等待用户提交答案后，再输出下一个 form_request 收集下一个信息。
4. 当信息充分时，输出 task_split，并包含 "status": "DONE"。
5. 最终输出的 tasks 数量必须 >= ${context.minTaskCount}。
6. 最终任务要可执行、可测试、可验收。

现在请开始：若需要更多信息，输出第一个 form_request（只包含一个字段）；若信息已足够，直接输出带 status=DONE 的 task_split。`.trim()
}

export function buildFormResponsePrompt(formId: string, values: Record<string, unknown>): string {
  // 简化输出：只保留用户答案，节约上下文
  const valueStr = Object.entries(values)
    .map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
    .join(', ')

  return `[用户回答] ${valueStr}

请根据收集到的信息决定下一步：
- 需要更多信息：输出 form_request（单字段）
- 信息已足够：输出 task_split（含 status:DONE）`.trim()
}

export function buildOutputCorrectionPrompt(minTaskCount: number): string {
  return `你上一条输出不符合 JSON 协议。请重新输出，并满足:
- 只能输出 form_request 或 task_split 的 JSON
- 若输出 form_request，fields 数组只能包含 **一个** 字段
- 严禁 markdown 代码块（如 \`\`\`json）
- 不要输出额外解释或前后缀文本
- 若输出 task_split，必须包含 "status": "DONE"
- 若输出 task_split，tasks 数量必须 >= ${minTaskCount}`
}

export function buildPlanSplitJsonSchema(minTaskCount: number): string {
  const normalizedMinTaskCount = Math.max(1, Math.floor(minTaskCount || 1))

  // 避免 oneOf，同时保留关键字段约束，减少 structured_output 重试失败与下游解析失败。
  const schema = {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['form_request', 'task_split'] },
      question: { type: 'string' },
      formSchema: { type: 'object' },
      status: { type: 'string', enum: ['DONE'] },
      tasks: {
        type: 'array',
        items: { type: 'object' }
      }
    },
    additionalProperties: false,
    allOf: [
      {
        if: {
          type: 'object',
          properties: {
            type: { const: 'form_request' }
          },
          required: ['type']
        },
        then: {
          required: ['type', 'formSchema'],
          properties: {
            type: { const: 'form_request' },
            question: { type: 'string' },
            formSchema: {
              type: 'object',
              required: ['formId', 'title', 'fields'],
              properties: {
                formId: { type: 'string', minLength: 1 },
                title: { type: 'string', minLength: 1 },
                description: { type: 'string' },
                submitText: { type: 'string' },
                fields: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 1,
                  items: {
                    type: 'object',
                    required: ['name', 'label', 'type'],
                    properties: {
                      name: { type: 'string', minLength: 1 },
                      label: { type: 'string', minLength: 1 },
                      type: {
                        type: 'string',
                        enum: ['text', 'textarea', 'select', 'multiselect', 'number', 'checkbox', 'radio', 'date', 'slider']
                      },
                      required: { type: 'boolean' },
                      placeholder: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['label', 'value'],
                          properties: {
                            label: { type: 'string' },
                            value: {}
                          },
                          additionalProperties: true
                        }
                      },
                      validation: {
                        type: 'object',
                        additionalProperties: true
                      }
                    },
                    additionalProperties: true
                  }
                }
              },
              additionalProperties: true
            }
          }
        }
      },
      {
        if: {
          type: 'object',
          properties: {
            type: { const: 'task_split' }
          },
          required: ['type']
        },
        then: {
          required: ['type', 'status', 'tasks'],
          properties: {
            type: { const: 'task_split' },
            status: { const: 'DONE' },
            tasks: {
              type: 'array',
              minItems: normalizedMinTaskCount,
              items: {
                type: 'object',
                required: ['title', 'description', 'priority', 'implementationSteps', 'testSteps', 'acceptanceCriteria'],
                properties: {
                  title: { type: 'string', minLength: 1 },
                  description: { type: 'string', minLength: 1 },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                  implementationSteps: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  },
                  testSteps: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  },
                  acceptanceCriteria: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  }
                },
                additionalProperties: false
              }
            }
          }
        }
      }
    ]
  }

  return JSON.stringify(schema)
}
