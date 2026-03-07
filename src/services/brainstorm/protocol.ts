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
const MARKDOWN_CODE_BLOCK_REGEX = /```(?:json)?\s*([\s\S]*?)```/gi
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

/**
 * 尝试从各种格式中提取 JSON 文本
 * 支持:
 * 1. <brainstorm_payload>...</brainstorm_payload> 标签
 * 2. ```json ... ``` markdown 代码块
 * 3. 纯 JSON 对象（以 { 开头，以 } 结尾）
 */
function extractTagPayload(content: string): { displayContent: string; payloadText?: string; extractionMethod?: string } {
  let lastPayload: string | undefined
  let extractionMethod: string | undefined
  let displayContent = content

  // 1. 优先尝试从 <brainstorm_payload> 标签提取
  displayContent = displayContent.replace(TAG_REGEX, (_full, group: string) => {
    if (typeof group === 'string' && group.trim()) {
      lastPayload = group.trim()
      extractionMethod = 'tag'
    }
    return ''
  })

  // 2. 如果标签提取失败，尝试从 markdown 代码块提取
  if (!lastPayload) {
    let codeBlockContent: string | undefined
    displayContent = content.replace(MARKDOWN_CODE_BLOCK_REGEX, (_full, group: string) => {
      if (!codeBlockContent && typeof group === 'string' && group.trim()) {
        codeBlockContent = group.trim()
      }
      return ''
    })
    if (codeBlockContent) {
      lastPayload = codeBlockContent
      extractionMethod = 'markdown'
      displayContent = displayContent.trim()
    }
  }

  // 3. 如果仍然没有提取到，尝试检测纯 JSON 对象
  if (!lastPayload) {
    const trimmed = content.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      // 尝试找到最外层的 JSON 对象
      let braceCount = 0
      let jsonStart = -1
      let jsonEnd = -1

      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '{') {
          if (jsonStart === -1) jsonStart = i
          braceCount++
        } else if (trimmed[i] === '}') {
          braceCount--
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i + 1
            break
          }
        }
      }

      if (jsonStart !== -1 && jsonEnd !== -1) {
        lastPayload = trimmed.slice(jsonStart, jsonEnd)
        extractionMethod = 'raw'
        displayContent = ''
      }
    }
  }

  return {
    displayContent: displayContent.trim(),
    payloadText: lastPayload,
    extractionMethod
  }
}

/**
 * 尝试解析 JSON，处理常见的格式问题
 */
function tryParseJson(text: string): { parsed: unknown; error?: string } {
  // 尝试直接解析
  try {
    return { parsed: JSON.parse(text) }
  } catch {
    // 继续尝试其他方式
  }

  // 尝试移除可能的控制字符和尾部逗号
  try {
    // 移除尾部逗号 (trailing commas)
    const cleaned = text
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      // 移除单行注释
      .replace(/\/\/.*$/gm, '')
      // 移除多行注释
      .replace(/\/\*[\s\S]*?\*\//g, '')

    return { parsed: JSON.parse(cleaned) }
  } catch (e) {
    return {
      parsed: null,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export function extractBrainstormPayload(content: string): BrainstormParseResult {
  const { displayContent, payloadText, extractionMethod } = extractTagPayload(content)

  if (!payloadText) {
    return { displayContent: content }
  }

  const { parsed, error } = tryParseJson(payloadText)

  if (error || !parsed) {
    return {
      displayContent,
      error: `JSON 解析失败 (${extractionMethod || 'unknown'}): ${error || '无效的 JSON'}`
    }
  }

  const payload = parsePayloadObject(parsed)
  if (!payload) {
    return {
      displayContent,
      error: 'brainstorm payload 无有效字段 (需要 formRequest/todoOps/contextPatch 至少一个)'
    }
  }

  return {
    displayContent,
    payload
  }
}
