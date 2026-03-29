import i18n from '@/i18n'

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

function t(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) as string : i18n.global.t(key) as string
}

export function buildPlanSplitSystemPrompt(): string {
  return t('prompts.plan.splitSystem').trim()
}

export function buildPlanSplitKickoffPrompt(context: PlanSplitPromptContext): string {
  return [
    `${t('prompts.plan.kickoffPlanName')}: ${context.planName}`,
    `${t('prompts.plan.kickoffPlanDescription')}: ${context.planDescription?.trim() || t('prompts.plan.none')}`,
    `${t('prompts.plan.kickoffMinTaskCount')}: ${context.minTaskCount}`,
    '',
    t('prompts.plan.kickoffStart')
  ].join('\n').trim()
}

export function buildTaskResplitKickoffPrompt(context: TaskResplitPromptContext): string {
  const stepsList = context.implementationSteps.length > 0
    ? context.implementationSteps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')
    : `   ${t('prompts.plan.none')}`

  const testStepsList = context.testSteps.length > 0
    ? context.testSteps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')
    : `   ${t('prompts.plan.none')}`

  const criteriaList = context.acceptanceCriteria && context.acceptanceCriteria.length > 0
    ? context.acceptanceCriteria.map((c, i) => `   ${i + 1}. ${c}`).join('\n')
    : `   ${t('prompts.plan.none')}`

  const userPromptSection = context.userPrompt
    ? `\n\n${t('prompts.plan.extraRequirements')}:\n${context.userPrompt}`
    : ''

  return `${t('prompts.plan.resplitIntro', { minTaskCount: context.minTaskCount })}

${t('prompts.plan.plan')}: ${context.planName}
${t('prompts.plan.task')}: ${context.taskTitle}
${t('prompts.plan.description')}: ${context.taskDescription?.trim() || t('prompts.plan.none')}

${t('prompts.plan.implementationSteps')}:
${stepsList}

${t('prompts.plan.testSteps')}:
${testStepsList}

${t('prompts.plan.acceptanceCriteria')}:
${criteriaList}${userPromptSection}

${t('prompts.plan.directTaskSplitDone')}`.trim()
}

export function buildFormResponsePrompt(formId: string, values: Record<string, unknown>): string {
  const valueStr = Object.entries(values)
    .map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
    .join(', ')

  return [
    t('prompts.plan.formResponse', { formId, valueStr }),
    '',
    t('prompts.plan.formResponseContinue')
  ].join('\n').trim()
}

export function buildOutputCorrectionPrompt(minTaskCount: number): string {
  return t('prompts.plan.outputCorrection', { minTaskCount })
}

type PlanSplitSchemaProvider = 'claude' | 'codex' | 'generic'

function buildPlanSplitFieldSchema() {
  return {
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
      suggestion: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' }
              ]
            }
          }
        ]
      },
      suggestionReason: { type: 'string' },
      optionReasons: {
        type: 'object',
        additionalProperties: { type: 'string' }
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          required: ['label', 'value'],
          properties: {
            label: { type: 'string' },
            value: { type: 'string', minLength: 1 }
          },
          additionalProperties: false
        }
      },
      validation: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
          pattern: { type: 'string' },
          message: { type: 'string' }
        },
        additionalProperties: false
      },
      allowOther: { type: 'boolean' },
      otherLabel: { type: 'string' }
    },
    additionalProperties: false
  }
}

function buildPlanSplitFormSchema() {
  return {
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
        items: buildPlanSplitFieldSchema()
      }
    },
    additionalProperties: false
  }
}

function buildPlanSplitTaskSchema() {
  return {
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
        description: t('prompts.plan.dependsOnDescription'),
        items: { type: 'string' }
      }
    },
    additionalProperties: false
  }
}

function buildCodexPlanSplitFieldSchema() {
  return {
    type: 'object',
    required: [
      'name',
      'label',
      'type',
      'required',
      'placeholder',
      'suggestion',
      'suggestionReason',
      'optionReasons',
      'options',
      'allowOther',
      'otherLabel'
    ],
    properties: {
      name: { type: 'string', minLength: 1 },
      label: { type: 'string', minLength: 1 },
      type: {
        type: 'string',
        enum: ['text', 'textarea', 'select', 'multiselect', 'number', 'checkbox', 'radio', 'date', 'slider']
      },
      required: { type: 'boolean' },
      placeholder: { type: ['string', 'null'] },
      suggestion: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' }
              ]
            }
          },
          { type: 'null' }
        ]
      },
      suggestionReason: { type: ['string', 'null'] },
      optionReasons: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: { type: 'string' }
          },
          { type: 'null' }
        ]
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          required: ['label', 'value'],
          properties: {
            label: { type: 'string', minLength: 1 },
            value: { type: 'string', minLength: 1 }
          },
          additionalProperties: false
        }
      },
      allowOther: { type: 'boolean' },
      otherLabel: { type: ['string', 'null'] }
    },
    additionalProperties: false
  }
}

function buildCodexPlanSplitFormSchema() {
  return {
    type: 'object',
    required: ['formId', 'title', 'description', 'submitText', 'fields'],
    properties: {
      formId: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      description: { type: ['string', 'null'] },
      submitText: { type: ['string', 'null'] },
      fields: {
        type: 'array',
        minItems: 1,
        items: buildCodexPlanSplitFieldSchema()
      }
    },
    additionalProperties: false
  }
}

function buildCodexPlanSplitTaskSchema() {
  return {
    type: 'object',
    required: ['title', 'description', 'priority', 'implementationSteps', 'testSteps', 'acceptanceCriteria', 'dependsOn'],
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
        items: { type: 'string' }
      }
    },
    additionalProperties: false
  }
}

function buildCodexPlanSplitJsonSchema(minTaskCount: number) {
  const normalizedMinTaskCount = Math.max(1, Math.floor(minTaskCount || 1))

  // Codex 的 response_format schema 不支持 allOf/if/then，使用扁平结构，
  // 同时把可选字段显式列出为 null，减少模型漏字段导致前端表单渲染不稳定。
  return {
    type: 'object',
    required: ['type', 'question', 'forms', 'formSchema', 'status', 'tasks'],
    properties: {
      type: { type: 'string', enum: ['form_request', 'task_split'] },
      question: { type: ['string', 'null'] },
      forms: {
        type: ['array', 'null'],
        items: buildCodexPlanSplitFormSchema()
      },
      formSchema: {
        anyOf: [
          buildCodexPlanSplitFormSchema(),
          { type: 'null' }
        ]
      },
      status: {
        anyOf: [
          { type: 'string', enum: ['DONE'] },
          { type: 'null' }
        ]
      },
      tasks: {
        type: ['array', 'null'],
        minItems: normalizedMinTaskCount,
        items: buildCodexPlanSplitTaskSchema()
      }
    },
    additionalProperties: false
  }
}

function buildClaudePlanSplitJsonSchema(minTaskCount: number) {
  const normalizedMinTaskCount = Math.max(1, Math.floor(minTaskCount || 1))

  return {
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
          required: ['type'],
          properties: {
            type: { const: 'form_request' },
            question: { type: 'string' },
            forms: {
              type: 'array',
              minItems: 1,
              items: buildPlanSplitFormSchema()
            },
            formSchema: buildPlanSplitFormSchema()
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
              items: buildPlanSplitTaskSchema()
            }
          }
        }
      }
    ]
  }
}

export function buildPlanSplitJsonSchema(
  minTaskCount: number,
  provider: PlanSplitSchemaProvider = 'generic'
): string {
  const normalizedProvider = provider.toLowerCase() as PlanSplitSchemaProvider
  const schema = normalizedProvider === 'codex'
    ? buildCodexPlanSplitJsonSchema(minTaskCount)
    : buildClaudePlanSplitJsonSchema(minTaskCount)

  return JSON.stringify(schema)
}
