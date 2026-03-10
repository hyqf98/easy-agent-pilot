import type { AIFormRequest, DynamicFormSchema } from '@/types/plan'

export interface StructuredExecutionResult {
  summary: string
  generatedFiles: string[]
  modifiedFiles: string[]
  changedFiles: string[]
  deletedFiles: string[]
}

export type StructuredContentBlock =
  | {
    type: 'markdown'
    content: string
  }
  | {
    type: 'form'
    question?: string
    formSchema: DynamicFormSchema
  }
  | {
    type: 'result'
    result: StructuredExecutionResult
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function isDynamicFormSchema(value: unknown): value is DynamicFormSchema {
  return isRecord(value)
    && typeof value.formId === 'string'
    && typeof value.title === 'string'
    && Array.isArray(value.fields)
}

function toResultBlock(value: Record<string, unknown>): StructuredContentBlock | null {
  const generatedFiles = normalizeStringArray(value.generated_files)
  const modifiedFiles = normalizeStringArray(value.modified_files)
  const changedFiles = normalizeStringArray(value.changed_files)
  const deletedFiles = normalizeStringArray(value.deleted_files)
  const summary = typeof value.result_summary === 'string' ? value.result_summary.trim() : ''

  if (!summary && !generatedFiles.length && !modifiedFiles.length && !changedFiles.length && !deletedFiles.length) {
    return null
  }

  return {
    type: 'result',
    result: {
      summary,
      generatedFiles,
      modifiedFiles,
      changedFiles,
      deletedFiles
    }
  }
}

function toFormBlocks(value: Record<string, unknown>): StructuredContentBlock[] | null {
  if (value.type !== 'form_request') {
    return null
  }

  const question = typeof value.question === 'string' ? value.question : undefined
  const forms = Array.isArray(value.forms) ? value.forms : []
  const normalizedForms = forms.filter(isDynamicFormSchema)
  const singleForm = isDynamicFormSchema(value.formSchema) ? value.formSchema : null
  const formSchemas = normalizedForms.length > 0 ? normalizedForms : singleForm ? [singleForm] : []

  if (formSchemas.length === 0) {
    return null
  }

  return formSchemas.map(formSchema => ({
    type: 'form' as const,
    question,
    formSchema
  }))
}

function parseStructuredJsonValue(value: unknown): StructuredContentBlock[] | null {
  if (!isRecord(value)) {
    return null
  }

  const formBlocks = toFormBlocks(value)
  if (formBlocks) {
    return formBlocks
  }

  const resultBlock = toResultBlock(value)
  if (resultBlock) {
    return [resultBlock]
  }

  return null
}

function pushMarkdownBlock(blocks: StructuredContentBlock[], content: string): void {
  if (!content.trim()) {
    return
  }

  blocks.push({
    type: 'markdown',
    content
  })
}

export function parseStructuredContent(content: string): StructuredContentBlock[] {
  const blocks: StructuredContentBlock[] = []
  const codeBlockPattern = /```json\s*([\s\S]*?)```/g
  let lastIndex = 0
  let matchedJsonCodeBlock = false

  for (const match of content.matchAll(codeBlockPattern)) {
    matchedJsonCodeBlock = true
    const matchIndex = match.index ?? 0
    pushMarkdownBlock(blocks, content.slice(lastIndex, matchIndex))

    const rawJson = match[1]?.trim() ?? ''
    try {
      const parsed = JSON.parse(rawJson) as unknown
      const structuredBlocks = parseStructuredJsonValue(parsed)
      if (structuredBlocks && structuredBlocks.length > 0) {
        blocks.push(...structuredBlocks)
      } else {
        pushMarkdownBlock(blocks, match[0])
      }
    } catch {
      pushMarkdownBlock(blocks, match[0])
    }

    lastIndex = matchIndex + match[0].length
  }

  if (matchedJsonCodeBlock) {
    pushMarkdownBlock(blocks, content.slice(lastIndex))
    return blocks
  }

  const trimmed = content.trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const structuredBlocks = parseStructuredJsonValue(parsed)
    if (structuredBlocks && structuredBlocks.length > 0) {
      return structuredBlocks
    }
  } catch {
    // Ignore non-JSON content
  }

  return [{ type: 'markdown', content }]
}

export function extractExecutionResult(content: string): StructuredExecutionResult | null {
  const block = parseStructuredContent(content).find(item => item.type === 'result')
  return block?.type === 'result' ? block.result : null
}

export function extractFirstFormRequest(content: string): AIFormRequest | null {
  const formBlocks = parseStructuredContent(content).filter(item => item.type === 'form')
  if (formBlocks.length === 0) {
    return null
  }

  return {
    type: 'form_request',
    question: formBlocks[0].question || '需要您的输入',
    forms: formBlocks.map(block => block.formSchema)
  }
}

export function containsFormSchema(content: string, formId?: string): boolean {
  if (!formId) return false

  return parseStructuredContent(content).some(block =>
    block.type === 'form' && block.formSchema.formId === formId
  )
}
