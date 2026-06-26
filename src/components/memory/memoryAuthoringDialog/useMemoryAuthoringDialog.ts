import { computed, nextTick, ref } from 'vue'
import i18n, { getLocale } from '@/i18n'
import type { Message } from '@/stores/message'
import type { TimelineEntry } from '@/types/timeline'
import type { AgentConfig } from '@/stores/agent'
import type { SubAgent } from '@/stores/subAgent'
import type { MemoryLibrary, RawMemoryRecord } from '@/types/memory'
import { useAgentStore } from '@/stores/agent'
import { useSubAgentStore } from '@/stores/subAgent'
import { useMemoryStore } from '@/stores/memory'
import { useNotificationStore } from '@/stores/notification'
import { useProjectStore } from '@/stores/project'
import { agentExecutor } from '@/services/conversation/AgentExecutor'
import type { ConversationContext, StreamEvent } from '@/services/conversation/strategies/types'
import { buildSubAgentSystemPrompt, resolveSubAgentExecutionWithFallback } from '@/services/subAgent/runtime'
import { getErrorMessage } from '@/utils/api'

interface MemoryAuthoringDialogOpenOptions {
  autoGenerate?: boolean
  initialRecordIds?: string[]
}

interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

interface MemoryAuthoringExpertOption {
  id: string
  name: string
  description?: string
  prompt: string
  expert?: SubAgent
}

const BUILTIN_MEMORY_EXPERT_ID = '__memory-authoring-builtin__'

function translate(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) as string : i18n.global.t(key) as string
}

function isChineseLocale() {
  return getLocale() === 'zh-CN'
}

function buildBuiltinMemoryExpertPrompt(): string {
  if (isChineseLocale()) {
    return [
      '你是记忆库标准专家，负责把原始记忆和对话整理成长期稳定、便于后续协作复用的 Markdown 记忆库。',
      '优先沉淀：稳定背景、约定、偏好、长期规则、关键决策、重要上下文，不要保留一次性噪音。',
      '输出应当结构清晰、便于继续维护，并且可以直接作为记忆库正文保存。'
    ].join('\n')
  }

  return [
    'You are the standard memory-library expert.',
    'Turn raw memories and follow-up dialogue into a stable Markdown memory library that can be reused over time.',
    'Keep durable context, preferences, conventions, constraints, and key decisions. Remove one-off noise.'
  ].join('\n')
}

function buildMemoryAuthoringSystemPrompt(): string {
  if (isChineseLocale()) {
    return [
      '工作规则：',
      '1. 信息足够时，只输出完整 Markdown 草稿，不要输出解释，不要输出代码块。',
      `2. 如果还缺少关键信息，请用普通对话继续提问，并且首行以“${translate('memory.authoring.questionPrefix')}”开头。`,
      '3. 每次生成草稿时都必须返回完整稿件，而不是局部 diff。',
      '4. 只保留长期稳定、后续协作有价值的信息，剔除临时噪音。',
      '5. 标题层级要清晰，适合用户后续手动编辑。'
    ].join('\n')
  }

  return [
    'Rules:',
    '1. When information is sufficient, output only the full Markdown draft. Do not add explanations or code fences.',
    `2. If critical information is missing, ask in normal dialogue and start the first line with "${translate('memory.authoring.questionPrefix')}".`,
    '3. Whenever you generate a draft, return the full document rather than a partial diff.',
    '4. Keep only durable, reusable collaboration knowledge and remove one-off noise.',
    '5. Use clear heading structure so the user can keep editing it later.'
  ].join('\n')
}

function createMessage(role: Message['role'], content: string, sessionId: string): Message {
  return {
    id: `memory-authoring-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    requestId: `memory-authoring-${Date.now()}`,
    role,
    messageType: 'text',
    content,
    status: 'completed',
    seq: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function createTimelineEntry(entry: TimelineEntry): TimelineEntry {
  return {
    timestamp: new Date().toISOString(),
    ...entry
  }
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  return trimmed
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function limitText(value: string, maxLength: number): string {
  const normalized = compactWhitespace(value)
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}...`
}

function buildSourceRecordsContext(records: RawMemoryRecord[]): string {
  if (records.length === 0) {
    return isChineseLocale() ? '未提供原始记忆。' : 'No raw memories were provided.'
  }

  const sections: string[] = []
  let totalLength = 0
  const locale = isChineseLocale() ? 'zh-CN' : 'en-US'

  for (const [index, record] of records.entries()) {
    const content = record.content.trim()
    if (!content) continue

    const meta = [
      record.projectName || translate('memory.workspace.unlinkedProject'),
      record.sessionName || translate('memory.workspace.unlinkedSession'),
      new Date(record.createdAt).toLocaleString(locale)
    ].join(' / ')

    const block = [
      isChineseLocale() ? `### 原始记忆 ${index + 1}` : `### Raw Memory ${index + 1}`,
      `${isChineseLocale() ? '来源' : 'Source'}：${meta}`,
      content
    ].join('\n')

    totalLength += block.length
    if (totalLength > 12000 && sections.length > 0) {
      sections.push(
        isChineseLocale()
          ? `\n_其余 ${records.length - index} 条原始记忆已省略，请基于以上内容先完成当前整理。_`
          : `\n_The remaining ${records.length - index} raw memories are omitted for now. Continue with the content above first._`
      )
      break
    }

    sections.push(block)
  }

  return sections.join('\n\n')
}

function buildConversationHistory(turns: ConversationTurn[]): string {
  if (turns.length === 0) {
    return isChineseLocale() ? '这是第一轮交互。' : 'This is the first interaction.'
  }

  return turns
    .slice(-8)
    .map((turn, index) => {
      const label = turn.role === 'user'
        ? (isChineseLocale() ? '用户' : 'User')
        : 'AI'
      const content = limitText(turn.content, turn.role === 'assistant' ? 1200 : 600)
      return `${index + 1}. ${label}: ${content}`
    })
    .join('\n')
}

function buildMemoryAuthoringPrompt(input: {
  libraryName: string
  libraryDescription: string
  currentDraft: string
  selectedRecords: RawMemoryRecord[]
  conversationTurns: ConversationTurn[]
  latestInstruction: string
}): string {
  const currentDraft = input.currentDraft.trim() || (
    isChineseLocale()
      ? '_当前草稿为空，请直接生成完整初稿。_'
      : '_The current draft is empty. Generate the full first draft directly._'
  )
  const latestInstruction = input.latestInstruction.trim() || translate('memory.authoring.createDraftInstruction')

  return [
    input.libraryName.trim()
      ? `${isChineseLocale() ? '目标记忆库名称' : 'Target library name'}：${input.libraryName.trim()}`
      : '',
    input.libraryDescription.trim()
      ? `${isChineseLocale() ? '目标记忆库说明' : 'Target library description'}：${input.libraryDescription.trim()}`
      : '',
    isChineseLocale() ? '## 当前 Markdown 草稿' : '## Current Markdown Draft',
    currentDraft,
    '',
    isChineseLocale() ? '## 已选原始记忆' : '## Selected Raw Memories',
    buildSourceRecordsContext(input.selectedRecords),
    '',
    isChineseLocale() ? '## 最近交互记录' : '## Recent Conversation',
    buildConversationHistory(input.conversationTurns),
    '',
    isChineseLocale() ? '## 本次用户要求' : '## Latest User Request',
    latestInstruction
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeQuestionReply(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }

  const prefixes = Array.from(new Set([
    translate('memory.authoring.questionPrefix'),
    'Question:',
    '问题：'
  ]))

  for (const prefix of prefixes) {
    if (!trimmed.startsWith(prefix)) {
      continue
    }

    return trimmed.slice(prefix.length).trim() || trimmed
  }

  return null
}

function buildBuiltinMemoryExpertOption(): MemoryAuthoringExpertOption {
  return {
    id: BUILTIN_MEMORY_EXPERT_ID,
    name: translate('memory.authoring.builtinExpert'),
    description: translate('memory.authoring.builtinExpertDescription'),
    prompt: buildBuiltinMemoryExpertPrompt()
  }
}

export function useMemoryAuthoringDialog() {
  const memoryStore = useMemoryStore()
  const agentStore = useAgentStore()
  const agentTeamsStore = useSubAgentStore()
  const projectStore = useProjectStore()
  const notificationStore = useNotificationStore()

  const visible = ref(false)
  const isRunning = ref(false)
  const draftName = ref('')
  const draftDescription = ref('')
  const draftMarkdown = ref('')
  const streamingMarkdown = ref('')
  const instruction = ref('')
  const selectedExpertId = ref(BUILTIN_MEMORY_EXPERT_ID)
  const selectedRecordIds = ref<string[]>([])
  const messagesContainerRef = ref<HTMLElement | null>(null)
  const timelineEntries = ref<TimelineEntry[]>([])
  const conversationTurns = ref<ConversationTurn[]>([])
  const currentSessionId = ref<string | null>(null)
  const runtimeStatusText = ref('')

  const availableExperts = computed<MemoryAuthoringExpertOption[]>(() => [
    buildBuiltinMemoryExpertOption(),
    ...agentTeamsStore.enabledSubAgents.map((expert) => ({
      id: expert.id,
      name: expert.name,
      description: expert.description,
      prompt: expert.prompt,
      expert
    }))
  ])

  const selectedExpert = computed<MemoryAuthoringExpertOption | null>(() =>
    availableExperts.value.find((expert) => expert.id === selectedExpertId.value) ?? availableExperts.value[0] ?? null
  )

  const selectedRecords = computed(() =>
    memoryStore.rawRecords.filter(record => selectedRecordIds.value.includes(record.id))
  )

  const selectedRecordCount = computed(() => selectedRecords.value.length)

  const effectiveDraftMarkdown = computed(() =>
    isRunning.value && streamingMarkdown.value.trim()
      ? stripCodeFence(streamingMarkdown.value)
      : draftMarkdown.value
  )

  const canTriggerGeneration = computed(() =>
    !isRunning.value
    && Boolean(selectedExpert.value)
    && Boolean(
      instruction.value.trim()
      || selectedRecordCount.value > 0
      || draftMarkdown.value.trim()
    )
  )

  const canGenerateInitialDraft = computed(() =>
    !isRunning.value
    && Boolean(selectedExpert.value)
    && selectedRecordCount.value > 0
  )

  const canConfirm = computed(() =>
    !isRunning.value
    && Boolean(draftName.value.trim())
    && Boolean(effectiveDraftMarkdown.value.trim())
  )

  function resolveFallbackAgent(): AgentConfig | null {
    const currentAgent = agentStore.agents.find((agent) => agent.id === agentStore.currentAgentId)
    if (currentAgent && agentExecutor.isSupported(currentAgent)) {
      return currentAgent
    }

    return agentStore.agents.find((agent) => agentExecutor.isSupported(agent)) ?? null
  }

  function resolveSelectedRuntime() {
    const option = selectedExpert.value
    if (!option) {
      return null
    }

    if (option.expert) {
      const runtime = resolveSubAgentExecutionWithFallback(option.expert, agentStore.agents)
      if (runtime && agentExecutor.isSupported(runtime.agent)) {
        return {
          expertPrompt: option.prompt,
          agent: {
            ...runtime.agent,
            modelId: runtime.modelId || runtime.agent.modelId
          }
        }
      }
    }

    const fallbackAgent = resolveFallbackAgent()
    if (!fallbackAgent) {
      return null
    }

    return {
      expertPrompt: option.prompt,
      agent: fallbackAgent
    }
  }

  async function ensureDependenciesLoaded() {
    if (agentStore.agents.length === 0) {
      await agentStore.loadAgents()
    }
    if (agentTeamsStore.subAgents.length === 0) {
      await agentTeamsStore.loadSubAgents()
    }
    if (!selectedExpertId.value) {
      selectedExpertId.value = BUILTIN_MEMORY_EXPERT_ID
    }
  }

  function resetState(initialRecordIds: string[] = []) {
    draftName.value = ''
    draftDescription.value = ''
    draftMarkdown.value = ''
    streamingMarkdown.value = ''
    instruction.value = ''
    selectedExpertId.value = BUILTIN_MEMORY_EXPERT_ID
    selectedRecordIds.value = [...new Set(initialRecordIds)]
    timelineEntries.value = []
    conversationTurns.value = []
    runtimeStatusText.value = ''
    currentSessionId.value = null
  }

  async function openDialog(options: MemoryAuthoringDialogOpenOptions = {}) {
    await ensureDependenciesLoaded()
    resetState(options.initialRecordIds ?? [])
    visible.value = true

    if (options.autoGenerate && selectedRecordIds.value.length > 0) {
      await nextTick()
      void generateInitialDraft()
    }
  }

  function appendTimelineEntry(entry: TimelineEntry) {
    timelineEntries.value.push(createTimelineEntry(entry))
    void nextTick(() => {
      const container = messagesContainerRef.value
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
  }

  function syncSelectedRecordsFromStore() {
    selectedRecordIds.value = [...new Set(memoryStore.selectedRecordIds)]
  }

  function closeDialog() {
    if (currentSessionId.value) {
      agentExecutor.abort(currentSessionId.value)
    }

    visible.value = false
    isRunning.value = false
    streamingMarkdown.value = ''
    runtimeStatusText.value = ''
    currentSessionId.value = null
  }

  async function runAuthoring(latestInstruction: string, userLabel?: string) {
    const runtime = resolveSelectedRuntime()
    if (!runtime) {
      notificationStore.error(
        translate('memory.authoring.noAgent'),
        translate('memory.authoring.noAgentMessage')
      )
      return
    }

    if (!agentExecutor.isSupported(runtime.agent)) {
      notificationStore.error(
        translate('memory.authoring.unsupportedAgent'),
        translate('memory.authoring.unsupportedAgentMessage')
      )
      return
    }

    const normalizedInstruction = latestInstruction.trim()
    const hasUsefulContext = normalizedInstruction || selectedRecordCount.value > 0 || draftMarkdown.value.trim()
    if (!hasUsefulContext) {
      notificationStore.warning(
        translate('memory.authoring.missingContext'),
        translate('memory.authoring.missingContextMessage')
      )
      return
    }

    const sessionId = `memory-authoring-${Date.now()}`
    currentSessionId.value = sessionId
    isRunning.value = true
    runtimeStatusText.value = translate('memory.authoring.running')
    streamingMarkdown.value = ''

    if (userLabel || normalizedInstruction) {
      const content = userLabel || normalizedInstruction
      conversationTurns.value.push({
        role: 'user',
        content
      })
      appendTimelineEntry({
        id: `${sessionId}-user`,
        type: 'message',
        role: 'user',
        content
      })
    }

    const previousDraft = draftMarkdown.value
    let generatedContent = ''
    let executionError: string | null = null

    const context: ConversationContext = {
      sessionId,
      requestId: `memory-authoring-${Date.now()}`,
      agent: runtime.agent,
      messages: [
        createMessage('system', buildSubAgentSystemPrompt(runtime.expertPrompt, [
          buildMemoryAuthoringSystemPrompt()
        ]), sessionId),
        createMessage('user', buildMemoryAuthoringPrompt({
          libraryName: draftName.value,
          libraryDescription: draftDescription.value,
          currentDraft: previousDraft,
          selectedRecords: selectedRecords.value,
          conversationTurns: conversationTurns.value,
          latestInstruction: normalizedInstruction
        }), sessionId)
      ],
      workingDirectory: projectStore.currentProject?.path,
      executionMode: 'chat',
      responseMode: 'stream_text'
    }

    try {
      await agentExecutor.execute(context, (event: StreamEvent) => {
        switch (event.type) {
          case 'thinking':
          case 'thinking_start':
            runtimeStatusText.value = translate('memory.authoring.runningThinking')
            break
          case 'tool_use':
          case 'tool_result':
          case 'tool_input_delta':
            runtimeStatusText.value = translate('memory.authoring.runningStructuring')
            break
          case 'content': {
            if (!event.content) return
            generatedContent += event.content
            const normalized = stripCodeFence(generatedContent)
            if (!normalizeQuestionReply(normalized) && normalized.trim()) {
              streamingMarkdown.value = normalized
            }
            runtimeStatusText.value = translate('memory.authoring.runningDraft')
            break
          }
          case 'error':
            executionError = event.error || translate('memory.authoring.noDraft')
            break
          default:
            break
        }
      })

      if (executionError) {
        throw new Error(executionError)
      }

      const normalizedResponse = stripCodeFence(generatedContent).trim()
      if (!normalizedResponse) {
        throw new Error(translate('memory.authoring.noDraft'))
      }

      const assistantQuestion = normalizeQuestionReply(normalizedResponse)
      if (assistantQuestion) {
        draftMarkdown.value = previousDraft
        streamingMarkdown.value = ''
        runtimeStatusText.value = ''
        conversationTurns.value.push({
          role: 'assistant',
          content: assistantQuestion
        })
        appendTimelineEntry({
          id: `${sessionId}-assistant-question`,
          type: 'message',
          role: 'assistant',
          content: assistantQuestion
        })
        return
      }

      draftMarkdown.value = normalizedResponse
      streamingMarkdown.value = ''
      runtimeStatusText.value = ''
      conversationTurns.value.push({
        role: 'assistant',
        content: normalizedResponse
      })
      appendTimelineEntry({
        id: `${sessionId}-assistant-draft`,
        type: 'message',
        role: 'assistant',
        content: previousDraft.trim()
          ? translate('memory.authoring.draftUpdatedNotice')
          : translate('memory.authoring.draftCreatedNotice')
      })
    } catch (error) {
      draftMarkdown.value = previousDraft
      streamingMarkdown.value = ''
      runtimeStatusText.value = ''
      appendTimelineEntry({
        id: `${sessionId}-error`,
        type: 'error',
        role: 'system',
        content: getErrorMessage(error)
      })
      notificationStore.error(translate('memory.title'), getErrorMessage(error))
    } finally {
      isRunning.value = false
      currentSessionId.value = null
    }
  }

  async function generateInitialDraft() {
    if (selectedRecordCount.value === 0) {
      syncSelectedRecordsFromStore()
    }

    if (selectedRecordCount.value === 0) {
      notificationStore.warning(
        translate('memory.authoring.noSelectedRecords'),
        translate('memory.authoring.noSelectedRecordsMessage')
      )
      return
    }

    await runAuthoring(
      translate('memory.authoring.createDraftInstruction'),
      translate('memory.authoring.createDraftLabel')
    )
  }

  async function submitInstruction() {
    const value = instruction.value.trim()
    if (!value) {
      return
    }

    instruction.value = ''
    await runAuthoring(value)
  }

  async function confirmCreate() {
    const name = draftName.value.trim()
    const contentMd = effectiveDraftMarkdown.value.trim()

    if (!name || !contentMd) {
      return
    }

    const library: MemoryLibrary = await memoryStore.createLibrary({
      name,
      description: draftDescription.value.trim() || undefined,
      contentMd
    })

    await memoryStore.setActiveLibrary(library.id)
    memoryStore.clearSelectedRecords()
    notificationStore.success(translate('memory.authoring.createdSuccess', { name: library.name }))
    closeDialog()
  }

  function stopGeneration() {
    if (!currentSessionId.value) return
    agentExecutor.abort(currentSessionId.value)
    isRunning.value = false
    runtimeStatusText.value = ''
    streamingMarkdown.value = ''
    currentSessionId.value = null
    appendTimelineEntry({
      id: `memory-authoring-stop-${Date.now()}`,
      type: 'system',
      role: 'system',
      content: translate('memory.authoring.stoppedNotice')
    })
  }

  return {
    visible,
    isRunning,
    draftName,
    draftDescription,
    draftMarkdown,
    effectiveDraftMarkdown,
    streamingMarkdown,
    instruction,
    selectedExpertId,
    selectedRecordIds,
    selectedRecords,
    selectedRecordCount,
    availableExperts,
    canTriggerGeneration,
    canGenerateInitialDraft,
    canConfirm,
    messagesContainerRef,
    timelineEntries,
    runtimeStatusText,
    openDialog,
    closeDialog,
    syncSelectedRecordsFromStore,
    generateInitialDraft,
    submitInstruction,
    confirmCreate,
    stopGeneration
  }
}
