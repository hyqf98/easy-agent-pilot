import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAgentStore, type AgentConfig } from './agent'
import { logger } from '@/utils/logger'
import { formEngine } from '@/services/plan'
import {
  taskSplitOrchestrator,
  type SplitChatMessage,
  buildPlanSplitSystemPrompt,
  buildPlanSplitKickoffPrompt,
  buildFormResponsePrompt,
  buildPlanSplitJsonSchema
} from '@/services/plan'
import type {
  SplitMessage,
  AIOutput,
  AITaskItem,
  TaskPriority,
  DynamicFormSchema
} from '@/types/plan'

interface TaskSplitContext {
  planId: string
  planName: string
  planDescription?: string
  granularity: number
  agentId: string
  modelId: string
  workingDirectory?: string
}

interface ParsedAiResult {
  output?: AIOutput
  error?: string
  debug?: ParseDebugInfo
}

interface ParseAttemptDebug {
  candidateIndex: number
  candidatePreview: string
  parseError?: string
  normalizeError?: string
}

interface ParseDebugInfo {
  rawContent: string
  sanitizedContent: string
  candidateCount: number
  attempts: ParseAttemptDebug[]
}

interface TaskSplitTurnExecutionParams {
  agent: AgentConfig
  context: TaskSplitContext
  messages: SplitChatMessage[]
  onContent: (delta: string) => void
}

interface TaskSplitAgentStrategy {
  readonly name: string
  supports(agent: AgentConfig): boolean
  executeTurn(params: TaskSplitTurnExecutionParams): Promise<string>
  parseOutput(content: string, minTaskCount: number): ParsedAiResult | null
}

// 持久化的拆分状态（用于关闭弹框后恢复）
interface PersistedSplitState {
  messages: SplitMessage[]
  llmMessages: SplitChatMessage[]
  splitResult: AITaskItem[] | null
  currentFormId: string | null
  context: TaskSplitContext
}

export const useTaskSplitStore = defineStore('taskSplit', () => {
  const messages = ref<SplitMessage[]>([])
  const isProcessing = ref(false)
  const splitResult = ref<AITaskItem[] | null>(null)
  const currentFormId = ref<string | null>(null)
  const context = ref<TaskSplitContext | null>(null)

  const llmMessages = ref<SplitChatMessage[]>([])

  // 持久化状态 key 前缀
  const TASK_SPLIT_STATE_KEY_PREFIX = 'task_split_state:'
  const TASK_SPLIT_STATE_STORAGE_KEY = `${TASK_SPLIT_STATE_KEY_PREFIX}all`

  function getAllPersistedStates(): Record<string, PersistedSplitState> {
    if (typeof window === 'undefined') {
      return {}
    }

    try {
      const raw = window.localStorage.getItem(TASK_SPLIT_STATE_STORAGE_KEY)
      if (!raw) return {}

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {}
      }

      return parsed as Record<string, PersistedSplitState>
    } catch (error) {
      logger.warn('[TaskSplit] 读取持久化状态失败，已忽略:', error)
      return {}
    }
  }

  function saveAllPersistedStates(states: Record<string, PersistedSplitState>) {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(TASK_SPLIT_STATE_STORAGE_KEY, JSON.stringify(states))
    } catch (error) {
      logger.warn('[TaskSplit] 保存持久化状态失败，已忽略:', error)
    }
  }

  // 保存当前状态（用于关闭弹框前保存）
  function persistCurrentState() {
    if (!context.value) return
    const planId = context.value.planId

    // 如果正在处理中，标记最后一条assistant消息为取消状态
    if (isProcessing.value && messages.value.length > 0) {
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage.role === 'assistant') {
        lastMessage.cancelled = true
      }
    }

    // 构建要保存的状态
    const stateToSave: PersistedSplitState = {
      messages: messages.value.map(msg => ({
        ...msg,
        formSchema: msg.formSchema ? JSON.parse(JSON.stringify(msg.formSchema)) : undefined,
        formValues: msg.formValues ? JSON.parse(JSON.stringify(msg.formValues)) : undefined
      })),
      llmMessages: [...llmMessages.value],
      splitResult: splitResult.value ? JSON.parse(JSON.stringify(splitResult.value)) : null,
      currentFormId: currentFormId.value,
      context: { ...context.value }
    }

    // 保存到 localStorage
    const allStates = getAllPersistedStates()
    allStates[planId] = stateToSave
    saveAllPersistedStates(allStates)

    // 保存后重置处理状态
    isProcessing.value = false
  }

  // 恢复持久化状态
  function restorePersistedState(planId: string): boolean {
    const allStates = getAllPersistedStates()
    const persisted = allStates[planId]
    if (!persisted) return false

    // 深拷贝恢复消息（确保复杂对象如formSchema也被正确复制）
    messages.value = persisted.messages.map(msg => ({
      ...msg,
      formSchema: msg.formSchema ? JSON.parse(JSON.stringify(msg.formSchema)) : undefined,
      formValues: msg.formValues ? JSON.parse(JSON.stringify(msg.formValues)) : undefined
    }))

    // 检查最后一条消息是否被取消
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.cancelled && lastMsg.role === 'assistant') {
      // 如果最后一条是被取消的assistant消息，且内容不完整，移除它
      if (!lastMsg.formSchema && !lastMsg.content.includes('DONE')) {
        messages.value.pop()
      }
    }

    // 重新构建llmMessages，基于清理后的messages
    llmMessages.value = [
      {
        role: 'system',
        content: buildPlanSplitSystemPrompt()
      }
    ]

    // 根据清理后的消息重建LLM历史
    for (const msg of messages.value) {
      if (msg.role === 'user') {
        // 用户消息：如果有formValues则使用表单响应prompt，否则使用显示内容
        if (msg.formValues && msg.formSchema) {
          llmMessages.value.push({
            role: 'user',
            content: buildFormResponsePrompt(msg.formSchema.formId, msg.formValues)
          })
        } else {
          llmMessages.value.push({
            role: 'user',
            content: msg.content
          })
        }
      } else if (msg.role === 'assistant' && msg.rawContent && !msg.cancelled) {
        // assistant消息：使用原始内容（只有未被取消的才加入历史）
        llmMessages.value.push({
          role: 'assistant',
          content: msg.rawContent
        })
      }
    }

    // 深拷贝恢复拆分结果
    splitResult.value = persisted.splitResult
      ? JSON.parse(JSON.stringify(persisted.splitResult))
      : null
    currentFormId.value = persisted.currentFormId

    // 如果恢复后有拆分结果，需要重新计算currentFormId
    if (splitResult.value && splitResult.value.length > 0) {
      // 拆分已完成，不需要表单
      currentFormId.value = null
    } else {
      // 检查是否有待处理的表单
      const lastFormMessage = [...messages.value]
        .reverse()
        .find(msg => msg.formSchema && !msg.formValues)
      currentFormId.value = lastFormMessage?.formSchema?.formId ?? null
    }

    return true
  }

  // 清理指定planId的持久化状态
  function clearPersistedState(planId: string) {
    const allStates = getAllPersistedStates()
    delete allStates[planId]
    saveAllPersistedStates(allStates)
  }

  // 检查是否有持久化状态
  function hasPersistedState(planId: string): boolean {
    const allStates = getAllPersistedStates()
    return planId in allStates
  }

  async function initSession(nextContext: TaskSplitContext) {
    // 检查是否有可恢复的状态
    const hasState = await hasPersistedState(nextContext.planId)
    if (hasState) {
      // 恢复状态
      context.value = nextContext
      await restorePersistedState(nextContext.planId)

      // 检查是否需要继续 AI 处理
      // 条件：最后一条是 user 消息，且没有拆分结果，且没有待处理的表单
      const lastMessage = messages.value[messages.value.length - 1]
      const needsContinue = lastMessage?.role === 'user'
        && !splitResult.value
        && !currentFormId.value

      if (needsContinue) {
        await runAssistantTurn()
      }
      return
    }

    // 没有可恢复的状态，开始新会话
    reset()
    context.value = nextContext

    llmMessages.value = [
      {
        role: 'system',
        content: buildPlanSplitSystemPrompt()
      }
    ]

    const kickoffPrompt = buildPlanSplitKickoffPrompt({
      planName: nextContext.planName,
      planDescription: nextContext.planDescription,
      minTaskCount: nextContext.granularity
    })

    const kickoffDisplayContent = [
      `计划标题：${nextContext.planName}`,
      `计划描述：${nextContext.planDescription?.trim() || '（无）'}`,
      `拆分任务数量：至少拆分 ${nextContext.granularity} 个任务`
    ].join('\n')

    await submitUserMessage(kickoffPrompt, {
      visible: true,
      displayContent: kickoffDisplayContent
    })
  }

  async function submitUserMessage(
    content: string,
    options?: { visible?: boolean; displayContent?: string }
  ) {
    if (!content.trim() || isProcessing.value || !context.value) return

    const visible = options?.visible ?? true
    const displayContent = options?.displayContent ?? content.trim()

    if (visible) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: displayContent,
        timestamp: new Date().toISOString()
      })
    }

    llmMessages.value.push({
      role: 'user',
      content: content.trim()
    })

    await runAssistantTurn()
  }

  async function submitFormResponse(formId: string, values: Record<string, unknown>) {
    if (!context.value || isProcessing.value) return

    const lastFormMessage = [...messages.value]
      .reverse()
      .find(message => message.formSchema?.formId === formId)

    if (lastFormMessage) {
      lastFormMessage.formValues = values
    }

    const prompt = buildFormResponsePrompt(formId, values)
    const displayContent = formatFormResponseSummary(lastFormMessage?.formSchema, values)
    await submitUserMessage(prompt, {
      visible: true,
      displayContent
    })
  }

  async function runAssistantTurn() {
    if (!context.value) return

    const agentStore = useAgentStore()
    const agent = agentStore.agents.find(a => a.id === context.value?.agentId)
    if (!agent) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '未找到选中的智能体，请重新选择后重试。',
        timestamp: new Date().toISOString()
      })
      return
    }

    isProcessing.value = true
    try {
      await runAssistantTurnInternal(agent)
    } finally {
      isProcessing.value = false
    }
  }

  async function runAssistantTurnInternal(
    agent: AgentConfig
  ) {
    if (!context.value) return
    const strategy = resolveTaskSplitStrategy(agent)

    const assistantMessage: SplitMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    }
    messages.value.push(assistantMessage)

    try {
      const finalContent = await strategy.executeTurn({
        agent,
        context: context.value,
        messages: llmMessages.value,
        onContent: (delta) => { assistantMessage.content += delta }
      })

      assistantMessage.rawContent = finalContent
      llmMessages.value.push({ role: 'assistant', content: finalContent })

      const parsed = parseAIOutput(finalContent, context.value.granularity, strategy)
      if (!parsed.output) {
        logParseDebug(parsed, finalContent)
        assistantMessage.content = `解析失败：${parsed.error || '模型输出格式无法解析，请补充需求后重试。'}`
        return
      }

      applyParsedOutput(assistantMessage, parsed.output)
    } catch (error) {
      logger.error('[runAssistantTurnInternal] 执行出错:', error)
      assistantMessage.content = `拆分失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  function applyParsedOutput(message: SplitMessage, output: AIOutput) {
    if (output.type === 'form_request') {
      message.content = output.question || '请先补充以下信息。'
      message.formSchema = output.formSchema
      currentFormId.value = output.formSchema.formId
      return
    }

    if (output.type === 'task_split') {
      splitResult.value = output.tasks
      currentFormId.value = null
      message.content = `DONE：任务拆分完成，共生成 ${output.tasks.length} 个任务，请确认。`
    }
  }

  async function executeTurnWithJsonStructuredOutput(params: TaskSplitTurnExecutionParams): Promise<string> {
    const { agent, context: splitContext, messages: splitMessages } = params
    const result = await taskSplitOrchestrator.executeTurn({
      agent,
      modelId: splitContext.modelId,
      workingDirectory: splitContext.workingDirectory,
      messages: splitMessages,
      systemPrompt: splitMessages.find(msg => msg.role === 'system')?.content,
      cliOutputFormat: 'json',
      jsonSchema: buildPlanSplitJsonSchema(splitContext.granularity),
      executionMode: 'task_split',
      responseMode: 'json_once',
      onContent: () => {
        // 任务拆分采用单轮结构化输出，不在消息区展示 JSON 流片段
      }
    })
    return result
  }

  async function executeTurnWithDefaultStrategy(params: TaskSplitTurnExecutionParams): Promise<string> {
    const { agent, context: splitContext, messages: splitMessages, onContent } = params
    return taskSplitOrchestrator.executeTurn({
      agent,
      modelId: splitContext.modelId,
      workingDirectory: splitContext.workingDirectory,
      messages: splitMessages,
      systemPrompt: splitMessages.find(msg => msg.role === 'system')?.content,
      onContent
    })
  }

  const claudeCliTaskSplitStrategy: TaskSplitAgentStrategy = {
    name: 'claude-cli-task-split',
    supports: (agent) => agent.type === 'cli' && (agent.provider || '').toLowerCase() === 'claude',
    executeTurn: executeTurnWithJsonStructuredOutput,
    parseOutput: parseClaudeCliOutput
  }

  const codexCliTaskSplitStrategy: TaskSplitAgentStrategy = {
    name: 'codex-cli-task-split',
    supports: (agent) => agent.type === 'cli' && (agent.provider || '').toLowerCase() === 'codex',
    executeTurn: executeTurnWithJsonStructuredOutput,
    parseOutput: parseCodexCliOutput
  }

  const defaultTaskSplitStrategy: TaskSplitAgentStrategy = {
    name: 'default-task-split',
    supports: () => true,
    executeTurn: executeTurnWithDefaultStrategy,
    parseOutput: () => null
  }

  const taskSplitStrategies: TaskSplitAgentStrategy[] = [
    claudeCliTaskSplitStrategy,
    codexCliTaskSplitStrategy
  ]

  function resolveTaskSplitStrategy(agent: AgentConfig): TaskSplitAgentStrategy {
    return taskSplitStrategies.find(strategy => strategy.supports(agent)) ?? defaultTaskSplitStrategy
  }

  function parseAIOutput(content: string, minTaskCount: number, strategy: TaskSplitAgentStrategy): ParsedAiResult {
    const strategyParsed = strategy.parseOutput(content, minTaskCount)
    // 如果策略返回了结果（无论成功还是失败），直接返回
    if (strategyParsed) {
      return strategyParsed
    }

    const jsonCandidates = extractJsonCandidates(content)
    const sanitized = sanitizeAssistantOutput(content)
    const attempts: ParseAttemptDebug[] = []

    // 优先使用最后一个候选（通常是模型最终输出）
    for (let i = jsonCandidates.length - 1; i >= 0; i -= 1) {
      const jsonText = jsonCandidates[i]
      const attempt: ParseAttemptDebug = {
        candidateIndex: i,
        candidatePreview: previewText(jsonText, 600)
      }

      try {
        const parsed = JSON.parse(jsonText)
        const normalized = normalizeAIOutput(parsed, minTaskCount)
        if (normalized.output) {
          return normalized
        }
        attempt.normalizeError = normalized.error || 'unknown normalize error'
      } catch {
        attempt.parseError = 'JSON.parse failed'
      }
      attempts.push(attempt)
    }

    return {
      error: '无法解析为有效的 JSON 输出。',
      debug: {
        rawContent: content,
        sanitizedContent: sanitized,
        candidateCount: jsonCandidates.length,
        attempts
      }
    }
  }

  function extractJsonCandidates(content: string): string[] {
    const candidates: string[] = []
    const sanitized = sanitizeAssistantOutput(content)
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi

    let match: RegExpExecArray | null
    while ((match = codeBlockRegex.exec(sanitized)) !== null) {
      if (match[1]?.trim()) {
        candidates.push(match[1].trim())
      }
    }

    // 从纯文本中提取所有平衡 JSON 对象（过滤掉前置思考/工具噪声）
    candidates.push(...extractBalancedJsonObjects(sanitized))

    if (sanitized.trim()) {
      candidates.push(sanitized.trim())
    }

    // 去重，保持顺序
    const seen = new Set<string>()
    return candidates.filter(item => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
  }

  function sanitizeAssistantOutput(content: string): string {
    return content
      .replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
      .replace(/<tool_use[\s\S]*?<\/tool_use>/gi, '')
      .replace(/<tool_result[\s\S]*?<\/tool_result>/gi, '')
      .replace(/<assistant_thinking[\s\S]*?<\/assistant_thinking>/gi, '')
      .trim()
  }

  function extractBalancedJsonObjects(text: string): string[] {
    const objects: string[] = []
    let start = -1
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\') {
          escaped = true
          continue
        }
        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{') {
        if (depth === 0) {
          start = index
        }
        depth += 1
        continue
      }

      if (char === '}') {
        if (depth === 0) continue
        depth -= 1
        if (depth === 0 && start >= 0) {
          objects.push(text.slice(start, index + 1))
          start = -1
        }
      }
    }

    return objects
  }

  function normalizeAIOutput(value: unknown, minTaskCount: number): ParsedAiResult {
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) {
        const normalized = normalizeAIOutput(value[i], minTaskCount)
        if (normalized.output) {
          return normalized
        }
      }
      return { error: '输出是数组，但未找到有效的 form_request 或 task_split(DONE)。' }
    }

    if (!value || typeof value !== 'object') {
      return { error: '输出不是 JSON 对象。' }
    }

    const record = value as Record<string, unknown>

    if (typeof record.result === 'string') {
      const nested = tryParseNestedJson(record.result, minTaskCount)
      if (nested?.output) {
        return nested
      }
    }

    const rawType = asNonEmptyString(record.type)
    const normalizedType = rawType ? rawType.trim().toLowerCase() : null

    if (normalizedType === 'form_request') {
      return normalizeFormRequest(record)
    }

    if (normalizedType === 'task_split' || normalizedType === 'done') {
      return normalizeTaskSplit(record, minTaskCount)
    }

    if (isDoneSignal(record) && Array.isArray(record.tasks)) {
      return normalizeTaskSplit(record, minTaskCount)
    }

    return { error: '输出 type 必须为 form_request 或 task_split（status 必须为 DONE）。' }
  }

  function normalizeFormRequest(record: Record<string, unknown>): ParsedAiResult {
    const question = typeof record.question === 'string' ? record.question : ''
    const schema = normalizeFormSchema(record.formSchema ?? record.form_schema ?? record.schema)
    if (!schema) {
      return { error: 'form_request 缺少 formSchema。' }
    }

    const validSchema = formEngine.validateSchema(schema)
    if (!validSchema) {
      return { error: 'formSchema 结构无效。' }
    }

    return {
      output: {
        type: 'form_request',
        question: question || '请补充以下信息：',
        formSchema: validSchema
      }
    }
  }

  function normalizeTaskSplit(record: Record<string, unknown>, minTaskCount: number): ParsedAiResult {
    if (!isDoneSignal(record)) {
      return { error: 'task_split 必须包含 status: "DONE"（或等价 DONE 标记）。' }
    }

    const tasksRaw = record.tasks ?? record.task_list ?? record.taskList
    if (!Array.isArray(tasksRaw)) {
      return { error: 'task_split 缺少 tasks 数组。' }
    }
    if (tasksRaw.length < minTaskCount) {
      return { error: `拆分任务数量不足，至少需要 ${minTaskCount} 个。` }
    }

    const tasks: AITaskItem[] = []
    for (const item of tasksRaw) {
      if (!item || typeof item !== 'object') {
        return { error: 'tasks 中存在无效任务对象。' }
      }

      const task = item as Record<string, unknown>
      const title = asNonEmptyString(task.title)
      const description = asNonEmptyString(task.description)
      const priority = asPriority(task.priority)
      const implementationSteps = asStringArray(task.implementationSteps ?? task.implementation_steps ?? task.steps)
      const testSteps = asStringArray(task.testSteps ?? task.test_steps ?? task.testingSteps ?? task.testing_steps)
      const acceptanceCriteria = asStringArray(task.acceptanceCriteria ?? task.acceptance_criteria)

      if (!title || !description || !priority) {
        return { error: '任务缺少必要字段（title/description/priority）。' }
      }
      if (implementationSteps.length === 0 || testSteps.length === 0 || acceptanceCriteria.length === 0) {
        return { error: '任务步骤字段不能为空（implementationSteps/testSteps/acceptanceCriteria）。' }
      }

      tasks.push({
        title,
        description,
        priority,
        implementationSteps,
        testSteps,
        acceptanceCriteria
      })
    }

    return { output: { type: 'task_split', tasks } }
  }

  function isDoneSignal(record: Record<string, unknown>): boolean {
    if (record.done === true) return true

    const statusRaw = asNonEmptyString(record.status ?? record.state ?? record.phase)
    return statusRaw?.toUpperCase() === 'DONE'
  }

  function normalizeFormSchema(value: unknown): DynamicFormSchema | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const fieldsRaw = raw.fields
    if (!Array.isArray(fieldsRaw)) {
      return null
    }

    const normalizedFields = fieldsRaw
      .map(field => normalizeFormField(field))
      .filter((field): field is NonNullable<typeof field> => Boolean(field))

    const formId = asNonEmptyString(raw.formId ?? raw.form_id ?? raw.id)
    const title = asNonEmptyString(raw.title ?? raw.name)
    if (!formId || !title || normalizedFields.length === 0) {
      return null
    }

    return {
      formId,
      title,
      description: asOptionalString(raw.description),
      fields: normalizedFields,
      submitText: asOptionalString(raw.submitText ?? raw.submit_text)
    }
  }

  function normalizeFormField(value: unknown): DynamicFormSchema['fields'][number] | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = asNonEmptyString(raw.name ?? raw.field ?? raw.field_name)
    const label = asNonEmptyString(raw.label ?? raw.title ?? raw.name)
    const type = asNonEmptyString(raw.type)

    if (!name || !label || !type) {
      return null
    }

    const field: DynamicFormSchema['fields'][number] = { name, label, type: type as DynamicFormSchema['fields'][number]['type'] }

    if (typeof raw.required === 'boolean') field.required = raw.required
    if (raw.default !== undefined) field.default = raw.default
    if (asOptionalString(raw.placeholder)) field.placeholder = asOptionalString(raw.placeholder)

    if (Array.isArray(raw.options)) {
      field.options = raw.options
        .map(option => {
          if (!option || typeof option !== 'object') return null
          const opt = option as Record<string, unknown>
          const optLabel = asNonEmptyString(opt.label)
          if (!optLabel || opt.value === undefined) return null
          return { label: optLabel, value: opt.value }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    }

    if (raw.validation && typeof raw.validation === 'object') {
      field.validation = raw.validation as DynamicFormSchema['fields'][number]['validation']
    }

    if (raw.condition && typeof raw.condition === 'object') {
      field.condition = raw.condition as DynamicFormSchema['fields'][number]['condition']
    }

    return field
  }

  function tryParseNestedJson(content: string, minTaskCount: number): ParsedAiResult | null {
    const nestedCandidates = extractJsonCandidates(content)
    for (let i = nestedCandidates.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(nestedCandidates[i])
        const normalized = normalizeAIOutput(parsed, minTaskCount)
        if (normalized.output) {
          return normalized
        }
      } catch {
        // ignore parse error
      }
    }
    return null
  }

  function parseClaudeCliOutput(content: string, minTaskCount: number): ParsedAiResult | null {
    const jsonCandidates = extractJsonCandidates(content)

    for (let i = jsonCandidates.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(jsonCandidates[i])
        if (!parsed || typeof parsed !== 'object') {
          continue
        }

        const record = parsed as Record<string, unknown>

        // 优先处理 structured_output 字段
        if (record.structured_output && typeof record.structured_output === 'object') {
          const normalized = normalizeAIOutput(record.structured_output, minTaskCount)
          // 无论成功还是失败，都返回结果（包含错误信息）
          return normalized
        }

        // 如果没有 structured_output，尝试直接解析
        const normalized = normalizeAIOutput(record, minTaskCount)
        if (normalized.output) {
          return normalized
        }
      } catch (e) {
        logger.error(`[parseClaudeCliOutput] 候选项 ${i} JSON 解析失败:`, e)
      }
    }

    return null
  }

  function parseCodexCliOutput(content: string, minTaskCount: number): ParsedAiResult | null {
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]
      if (!line.startsWith('{') && !line.startsWith('[')) continue

      try {
        const parsed = JSON.parse(line)
        if (!parsed || typeof parsed !== 'object') continue
        const record = parsed as Record<string, unknown>

        const directOutput = record.output_struct
          ?? record.structured_output
          ?? record.output
          ?? record.result
        if (directOutput !== undefined) {
          if (typeof directOutput === 'string') {
            const nested = tryParseNestedJson(directOutput, minTaskCount)
            if (nested?.output) {
              return nested
            }
          }
          const normalized = normalizeAIOutput(directOutput, minTaskCount)
          if (normalized.output) {
            return normalized
          }
        }

        const item = record.item
        if (item && typeof item === 'object') {
          const normalized = normalizeAIOutput(item, minTaskCount)
          if (normalized.output) {
            return normalized
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return null
  }

  function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  function asOptionalString(value: unknown): string | undefined {
    const normalized = asNonEmptyString(value)
    return normalized ?? undefined
  }

  function asPriority(value: unknown): TaskPriority | null {
    if (value === 'high' || value === 'medium' || value === 'low') {
      return value
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'p0' || normalized === 'urgent' || normalized === 'critical' || normalized === 'high' || normalized === '高') {
        return 'high'
      }
      if (normalized === 'p1' || normalized === 'normal' || normalized === 'medium' || normalized === '中') {
        return 'medium'
      }
      if (normalized === 'p2' || normalized === 'low' || normalized === '低') {
        return 'low'
      }
    }
    return null
  }

  function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }

  function previewText(text: string, maxLength = 500): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, maxLength)}...`
  }

  function logParseDebug(parsed: ParsedAiResult, rawContent: string) {
    const debug = parsed.debug
    // 始终打印原始内容，方便调试
    logger.error('[TaskSplitParser] rawContent length:', rawContent.length)
    logger.error('[TaskSplitParser] rawContent preview:', previewText(rawContent, 2000))

    if (!debug) {
      logger.error('[TaskSplitParser] parse failed without debug info', {
        error: parsed.error,
        rawPreview: previewText(rawContent, 1200)
      })
      return
    }

    logger.error('[TaskSplitParser] output parse failed', {
      error: parsed.error,
      candidateCount: debug.candidateCount,
      attempts: debug.attempts
    })
    logger.error('[TaskSplitParser] raw content', debug.rawContent)
    logger.error('[TaskSplitParser] sanitized content', debug.sanitizedContent)
  }

  function formatFormResponseSummary(
    schema: DynamicFormSchema | undefined,
    values: Record<string, unknown>
  ): string {
    if (!schema) {
      return '已提交表单信息'
    }

    const fieldMap = new Map(schema.fields.map(field => [field.name, field]))
    const lines = Object.entries(values).map(([key, value]) => {
      const field = fieldMap.get(key)
      const label = field?.label ?? key

      if (Array.isArray(value)) {
        const selected = value.map(item => {
          const option = field?.options?.find(opt => opt.value === item)
          return option?.label ?? String(item)
        })
        return `${label}：${selected.join('、')}`
      }
      if (typeof value === 'boolean') {
        return `${label}：${value ? '是' : '否'}`
      }
      const option = field?.options?.find(opt => opt.value === value)
      return `${label}：${option?.label ?? String(value ?? '')}`
    })

    return lines.length > 0 ? lines.join('\n') : '已提交表单信息'
  }

  function updateSplitTask(index: number, updates: Partial<AITaskItem>) {
    if (splitResult.value && splitResult.value[index]) {
      splitResult.value[index] = { ...splitResult.value[index], ...updates }
    }
  }

  function removeSplitTask(index: number) {
    if (splitResult.value) {
      splitResult.value.splice(index, 1)
    }
  }

  function addSplitTask(task: AITaskItem) {
    if (!splitResult.value) {
      splitResult.value = []
    }
    splitResult.value.push(task)
  }

  async function abort() {
    await taskSplitOrchestrator.abort()
  }

  function reset() {
    messages.value = []
    isProcessing.value = false
    splitResult.value = null
    currentFormId.value = null
    context.value = null
    llmMessages.value = []
  }

  return {
    messages,
    isProcessing,
    splitResult,
    currentFormId,
    context,
    initSession,
    submitUserMessage,
    submitFormResponse,
    updateSplitTask,
    removeSplitTask,
    addSplitTask,
    abort,
    reset,
    // 持久化相关
    persistCurrentState,
    clearPersistedState,
    hasPersistedState
  }
})
