import { formEngine } from '@/services/plan'
import type { DynamicFormSchema } from '@/types/plan'
import type {
  BrainstormFormRequest,
  BrainstormPayload,
  BrainstormTodoOp,
  BrainstormTodoStatus
} from '@/types/brainstorm'

interface RawBrainstormPayload {
  form_request?: unknown
  formRequest?: unknown
  todo_ops?: unknown
  todoOps?: unknown
  context_patch?: unknown
  contextPatch?: unknown
}

export interface BrainstormParseResult {
  displayContent: string
  payload?: BrainstormPayload
  error?: string
}

const TAG_REGEX = /<brainstorm_payload>([\s\S]*?)<\/brainstorm_payload>/gi
const TODO_STATUS: BrainstormTodoStatus[] = ['pending', 'in_progress', 'completed', 'blocked']

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function normalizeTodoOps(rawOps: unknown): BrainstormTodoOp[] {
  if (!Array.isArray(rawOps)) return []

  const normalized: BrainstormTodoOp[] = []

  for (const item of rawOps) {
    const record = asRecord(item)
    if (!record) continue

    const opValue = typeof record.op === 'string' ? record.op.toLowerCase() : ''
    if (!['add', 'update', 'complete', 'remove', 'reorder'].includes(opValue)) continue

    const status = typeof record.status === 'string' ? record.status : undefined
    if (status && !TODO_STATUS.includes(status as BrainstormTodoStatus)) continue

    normalized.push({
      op: opValue as BrainstormTodoOp['op'],
      id: typeof record.id === 'string' ? record.id : undefined,
      title: typeof record.title === 'string' ? record.title : undefined,
      description: typeof record.description === 'string' ? record.description : undefined,
      status: status as BrainstormTodoStatus | undefined,
      order: typeof record.order === 'number' ? record.order : undefined
    })
  }

  return normalized
}

function normalizeFormRequest(rawForm: unknown): BrainstormFormRequest | undefined {
  const record = asRecord(rawForm)
  if (!record) return undefined

  const rawSchema = record.formSchema ?? record.schema
  const schema = rawSchema ? formEngine.validateSchema(rawSchema as DynamicFormSchema) : null
  if (!schema) return undefined

  return {
    question: typeof record.question === 'string' ? record.question : undefined,
    formSchema: schema,
    defaultValues: asRecord(record.defaultValues ?? record.default_values) ?? undefined
  }
}

function parsePayloadObject(rawValue: unknown): BrainstormPayload | undefined {
  const record = asRecord(rawValue) as RawBrainstormPayload | null
  if (!record) return undefined

  const formRequest = normalizeFormRequest(record.form_request ?? record.formRequest)
  const todoOps = normalizeTodoOps(record.todo_ops ?? record.todoOps)
  const contextPatch = asRecord(record.context_patch ?? record.contextPatch) ?? undefined

  if (!formRequest && todoOps.length === 0 && !contextPatch) {
    return undefined
  }

  return {
    formRequest,
    todoOps,
    contextPatch
  }
}

function extractTagPayload(content: string): { displayContent: string; payloadText?: string } {
  let lastPayload: string | undefined
  let displayContent = content

  displayContent = displayContent.replace(TAG_REGEX, (_full, group: string) => {
    if (typeof group === 'string' && group.trim()) {
      lastPayload = group.trim()
    }
    return ''
  })

  return {
    displayContent: displayContent.trim(),
    payloadText: lastPayload
  }
}

export function extractBrainstormPayload(content: string): BrainstormParseResult {
  const { displayContent, payloadText } = extractTagPayload(content)

  if (!payloadText) {
    return { displayContent: content }
  }

  try {
    const parsed = JSON.parse(payloadText)
    const payload = parsePayloadObject(parsed)
    if (!payload) {
      return {
        displayContent,
        error: 'brainstorm payload 无有效字段'
      }
    }

    return {
      displayContent,
      payload
    }
  } catch (error) {
    return {
      displayContent,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
