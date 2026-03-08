export interface PlanSplitPromptContext {
  planName: string
  planDescription?: string
  minTaskCount: number
}

export interface TaskResplitPromptContext {
  planName: string
  planDescription?: string
  taskTitle: string
  taskDescription?: string
  implementationSteps: string[]
  testSteps: string[]
  acceptanceCriteria?: string[]
  userPrompt?: string
  minTaskCount: number
}

export function buildPlanSplitSystemPrompt(): string {
  return `你是项目规划助手，通过渐进式对话收集需求，最终拆分为可执行任务。

核心规则：
1. 每次只输出一个 form_request（单字段）收集一个信息
2. 收到用户回复后，再输出下一个问题
3. 信息充分后输出 task_split（status=DONE）
4. 任务需可执行、有明确边界、包含实现/测试步骤和验收标准
5. 用 dependsOn 指定任务依赖关系

禁止事项：
- 禁止输出 markdown 代码块或额外解释
- 禁止一次性输出多个问题`.trim()
}

export function buildPlanSplitKickoffPrompt(context: PlanSplitPromptContext): string {
  return `计划名称: ${context.planName}
计划描述: ${context.planDescription?.trim() || '（无）'}
最少任务数: ${context.minTaskCount}

请开始拆分：若信息不足则输出 form_request 收集信息；若信息已足够则直接输出 task_split。`.trim()
}

export function buildTaskResplitKickoffPrompt(context: TaskResplitPromptContext): string {
  const stepsList = context.implementationSteps.length > 0
    ? context.implementationSteps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')
    : '   （无）'

  const testStepsList = context.testSteps.length > 0
    ? context.testSteps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')
    : '   （无）'

  const criteriaList = context.acceptanceCriteria && context.acceptanceCriteria.length > 0
    ? context.acceptanceCriteria.map((c, i) => `   ${i + 1}. ${c}`).join('\n')
    : '   （无）'

  const userPromptSection = context.userPrompt
    ? `\n\n用户额外要求:\n${context.userPrompt}`
    : ''

  return `将以下任务拆分为 ${context.minTaskCount}+ 个子任务：

计划: ${context.planName}
任务: ${context.taskTitle}
描述: ${context.taskDescription?.trim() || '（无）'}

实现步骤:
${stepsList}

测试步骤:
${testStepsList}

验收标准:
${criteriaList}${userPromptSection}

直接输出 task_split（status=DONE）。`.trim()
}

export function buildFormResponsePrompt(formId: string, values: Record<string, unknown>): string {
  const valueStr = Object.entries(values)
    .map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
    .join(', ')

  return `用户回答: ${valueStr}

继续：需要更多信息则输出 form_request；信息足够则输出 task_split（status=DONE）。`.trim()
}

export function buildOutputCorrectionPrompt(minTaskCount: number): string {
  return `输出格式错误，请重新输出：
- form_request：fields 只能有一个字段
- task_split：必须含 status:DONE，tasks >= ${minTaskCount}
- 禁止 markdown 代码块和额外文字`
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
                  },
                  dependsOn: {
                    type: 'array',
                    description: '依赖的任务标题列表（必须先完成的任务）',
                    items: { type: 'string' }
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
