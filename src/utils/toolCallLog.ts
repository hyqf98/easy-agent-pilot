import type { ToolCall } from '@/stores/message'
import type { AIFormRequest, DynamicFormSchema } from '@/types/plan'
import { normalizeFormSchemaForRendering, normalizeFormSchemasForRendering } from './formSchema'

interface ToolCallLogLike {
  id: string
  type: string
  content: string
  metadata?: unknown
}

interface ToolCallMetadata {
  toolName?: string
  tool_name?: string
  toolCallId?: string
  tool_call_id?: string
  toolInput?: string
  tool_input?: string
  toolResult?: string
  tool_result?: string
  isError?: boolean
  rawMetadata?: unknown
}

interface ToolCallLogOptions {
  toolUseType?: string
  toolInputDeltaType?: string
  toolResultType?: string
  fallbackStatus?: ToolCall['status']
}

interface NormalizedToolCallLogOptions {
  toolUseType: string
  toolInputDeltaType: string
  toolResultType: string
  fallbackStatus: ToolCall['status']
}

interface ToolCallAssociations<T extends ToolCallLogLike> {
  effectiveToolCallIdByLogId: Map<string, string>
  resultLogByToolCallId: Map<string, T>
  inputDeltaLogByToolCallId: Map<string, string[]>
}

const METADATA_STRING_CACHE_LIMIT = 400
const metadataStringCache = new Map<string, ToolCallMetadata>()
const metadataObjectCache = new WeakMap<object, ToolCallMetadata>()

function setMetadataStringCache(key: string, value: ToolCallMetadata): void {
  metadataStringCache.set(key, value)
  if (metadataStringCache.size > METADATA_STRING_CACHE_LIMIT) {
    const oldestKey = metadataStringCache.keys().next().value
    if (oldestKey) {
      metadataStringCache.delete(oldestKey)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toToolCallMetadata(metadata: unknown): ToolCallMetadata {
  const normalize = (value: ToolCallMetadata): ToolCallMetadata => {
    const rawMetadata = value.rawMetadata
    const rawRecord = typeof rawMetadata === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(rawMetadata) as unknown
            return isRecord(parsed) ? parsed as ToolCallMetadata : {}
          } catch {
            return {}
          }
        })()
      : isRecord(rawMetadata)
        ? rawMetadata as ToolCallMetadata
        : {}

    const merged = {
      ...rawRecord,
      ...value
    }

    return {
      ...merged,
      toolName: merged.toolName ?? merged.tool_name,
      toolCallId: merged.toolCallId ?? merged.tool_call_id,
      toolInput: merged.toolInput ?? merged.tool_input,
      toolResult: merged.toolResult ?? merged.tool_result
    }
  }

  if (!metadata) return {}

  if (typeof metadata === 'string') {
    const cached = metadataStringCache.get(metadata)
    if (cached) {
      return cached
    }

    try {
      const normalized = normalize(JSON.parse(metadata) as ToolCallMetadata)
      setMetadataStringCache(metadata, normalized)
      return normalized
    } catch {
      return {}
    }
  }

  if (typeof metadata === 'object') {
    const cached = metadataObjectCache.get(metadata)
    if (cached) {
      return cached
    }

    const normalized = normalize(metadata as ToolCallMetadata)
    metadataObjectCache.set(metadata, normalized)
    return normalized
  }

  return {}
}

function toToolCallArguments(raw: string | undefined, fallbackContent: string): Record<string, unknown> {
  const source = raw?.trim() || fallbackContent.trim()
  if (!source) return {}

  try {
    const parsed = JSON.parse(source) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    return { value: source }
  }
}

function normalizeToolCallLogOptions(options: ToolCallLogOptions = {}): NormalizedToolCallLogOptions {
  return {
    toolUseType: options.toolUseType ?? 'tool_use',
    toolInputDeltaType: options.toolInputDeltaType ?? 'tool_input_delta',
    toolResultType: options.toolResultType ?? 'tool_result',
    fallbackStatus: options.fallbackStatus ?? 'running'
  }
}

function removeActiveToolCallId(activeToolCallIds: string[], toolCallId: string): void {
  const index = activeToolCallIds.lastIndexOf(toolCallId)
  if (index >= 0) {
    activeToolCallIds.splice(index, 1)
  }
}

function collectToolCallAssociations<T extends ToolCallLogLike>(
  logs: T[],
  options: NormalizedToolCallLogOptions
): ToolCallAssociations<T> {
  const effectiveToolCallIdByLogId = new Map<string, string>()
  const resultLogByToolCallId = new Map<string, T>()
  const inputDeltaLogByToolCallId = new Map<string, string[]>()
  const activeToolCallIds: string[] = []

  for (const log of logs) {
    const metadata = toToolCallMetadata(log.metadata)

    if (log.type === options.toolUseType) {
      if (!metadata.toolName) {
        continue
      }

      const effectiveToolCallId = metadata.toolCallId || log.id
      effectiveToolCallIdByLogId.set(log.id, effectiveToolCallId)

      if (!activeToolCallIds.includes(effectiveToolCallId)) {
        activeToolCallIds.push(effectiveToolCallId)
      }
      continue
    }

    if (log.type === options.toolInputDeltaType) {
      const effectiveToolCallId = metadata.toolCallId || activeToolCallIds[activeToolCallIds.length - 1]
      if (!effectiveToolCallId) {
        continue
      }

      effectiveToolCallIdByLogId.set(log.id, effectiveToolCallId)
      const currentInputs = inputDeltaLogByToolCallId.get(effectiveToolCallId) ?? []
      currentInputs.push(metadata.toolInput || log.content)
      inputDeltaLogByToolCallId.set(effectiveToolCallId, currentInputs)
      continue
    }

    if (log.type === options.toolResultType) {
      const effectiveToolCallId = metadata.toolCallId || activeToolCallIds[activeToolCallIds.length - 1]
      if (!effectiveToolCallId) {
        continue
      }

      effectiveToolCallIdByLogId.set(log.id, effectiveToolCallId)
      resultLogByToolCallId.set(effectiveToolCallId, log)
      removeActiveToolCallId(activeToolCallIds, effectiveToolCallId)
    }
  }

  return {
    effectiveToolCallIdByLogId,
    resultLogByToolCallId,
    inputDeltaLogByToolCallId
  }
}

export function extractDynamicFormSchema(payload: unknown): DynamicFormSchema | null {
  if (!isRecord(payload)) {
    return null
  }

  const candidate = payload.formSchema ?? payload.form_schema ?? payload.schema
  if (!isRecord(candidate)) {
    return null
  }

  if (typeof candidate.formId !== 'string' || typeof candidate.title !== 'string' || !Array.isArray(candidate.fields)) {
    return null
  }

  return normalizeFormSchemaForRendering(candidate as unknown as DynamicFormSchema)
}

export function extractDynamicFormSchemas(payload: unknown): DynamicFormSchema[] {
  if (!isRecord(payload)) {
    return []
  }

  const formRequest = payload as Partial<AIFormRequest> & Record<string, unknown>
  const forms = Array.isArray(formRequest.forms)
    ? formRequest.forms
    : []

  const normalizedForms = forms.filter(isRecord).filter(form =>
    typeof form.formId === 'string'
    && typeof form.title === 'string'
    && Array.isArray(form.fields)
  ) as unknown as DynamicFormSchema[]

  if (normalizedForms.length > 0) {
    return normalizeFormSchemasForRendering(normalizedForms)
  }

  const singleSchema = extractDynamicFormSchema(payload)
  return singleSchema ? [singleSchema] : []
}

export function buildToolCallFromLogs<T extends ToolCallLogLike>(
  log: T,
  logs: T[],
  options: ToolCallLogOptions = {}
): ToolCall | null {
  const {
    toolUseType,
    toolInputDeltaType,
    toolResultType,
    fallbackStatus
  } = normalizeToolCallLogOptions(options)

  if (log.type !== toolUseType) {
    return null
  }

  const metadata = toToolCallMetadata(log.metadata)
  if (!metadata.toolName) {
    return null
  }

  const associations = collectToolCallAssociations(logs, {
    toolUseType,
    toolInputDeltaType,
    toolResultType,
    fallbackStatus
  })
  const effectiveToolCallId = associations.effectiveToolCallIdByLogId.get(log.id) || metadata.toolCallId || log.id
  const resultLog = associations.resultLogByToolCallId.get(effectiveToolCallId)
  const resultMetadata = toToolCallMetadata(resultLog?.metadata)
  const isError = Boolean(resultMetadata.isError)
  const mergedToolInput = [
    metadata.toolInput,
    ...(associations.inputDeltaLogByToolCallId.get(effectiveToolCallId) ?? [])
  ]
    .filter((value): value is string => Boolean(value))
    .join('')

  return {
    id: effectiveToolCallId,
    name: metadata.toolName,
    arguments: toToolCallArguments(mergedToolInput || metadata.toolInput, log.content),
    status: resultLog ? (isError ? 'error' : 'success') : fallbackStatus,
    result: resultLog?.content,
    errorMessage: isError ? resultLog?.content : undefined
  }
}

export function buildToolCallMapFromLogs<T extends ToolCallLogLike>(
  logs: T[],
  options: ToolCallLogOptions = {}
): Map<string, ToolCall> {
  const {
    toolUseType,
    toolInputDeltaType,
    toolResultType,
    fallbackStatus
  } = normalizeToolCallLogOptions(options)

  const associations = collectToolCallAssociations(logs, {
    toolUseType,
    toolInputDeltaType,
    toolResultType,
    fallbackStatus
  })

  const toolCallMap = new Map<string, ToolCall>()

  for (const log of logs) {
    if (log.type !== toolUseType) {
      continue
    }

    const metadata = toToolCallMetadata(log.metadata)
    if (!metadata.toolName) {
      continue
    }

    const toolCallId = associations.effectiveToolCallIdByLogId.get(log.id) || metadata.toolCallId || log.id
    const resultLog = associations.resultLogByToolCallId.get(toolCallId)
    const resultMetadata = toToolCallMetadata(resultLog?.metadata)
    const isError = Boolean(resultMetadata.isError)
    const mergedToolInput = [
      metadata.toolInput,
      ...(associations.inputDeltaLogByToolCallId.get(toolCallId) ?? [])
    ]
      .filter((value): value is string => Boolean(value))
      .join('')

    toolCallMap.set(log.id, {
      id: toolCallId,
      name: metadata.toolName,
      arguments: toToolCallArguments(mergedToolInput || metadata.toolInput, log.content),
      status: resultLog ? (isError ? 'error' : 'success') : fallbackStatus,
      result: resultLog?.content,
      errorMessage: isError ? resultLog?.content : undefined
    })
  }

  return toolCallMap
}
