<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlanStore } from '@/stores/plan'
import { useTaskSplitStore } from '@/stores/taskSplit'
import { useTaskStore } from '@/stores/task'
import { useProjectStore } from '@/stores/project'
import { useThemeStore } from '@/stores/theme'
import { useAgentStore } from '@/stores/agent'
import { useAgentTeamsStore } from '@/stores/agentTeams'
import TaskSplitPreview from './TaskSplitPreview.vue'
import TaskListOptimizeModal from './TaskListOptimizeModal.vue'
import ExecutionTimeline from '@/components/message/ExecutionTimeline.vue'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import type {
  AITaskItem,
  DynamicFormSchema,
  PlanSplitLogRecord,
  SplitMessage,
  TaskListOptimizeConfig
} from '@/types/plan'
import type { TimelineEntry } from '@/types/timeline'
import { buildToolCallMapFromLogs, extractDynamicFormSchemas } from '@/utils/toolCallLog'
import {
  buildRuntimeNoticeFromSystemContent,
  buildUsageNotice,
  isContextRuntimeNotice
} from '@/utils/runtimeNotice'
import { extractFirstFormRequest, extractTaskSplitResult } from '@/utils/structuredContent'
import { DEFAULT_SPLIT_GRANULARITY } from '@/constants/plan'
import { logger } from '@/utils/logger'
import { resolveRecordedModelId } from '@/services/usage/agentCliUsageRecorder'
import { resolveExpertById, resolveExpertRuntime } from '@/services/agentTeams/runtime'

const planStore = usePlanStore()
const { t } = useI18n()
const taskSplitStore = useTaskSplitStore()
const taskStore = useTaskStore()
const projectStore = useProjectStore()
const themeStore = useThemeStore()
const agentStore = useAgentStore()
const agentTeamsStore = useAgentTeamsStore()
const isDarkTheme = computed(() => themeStore.isDark)

const isConfirming = ref(false)
const messagesContainerRef = ref<HTMLElement | null>(null)
const userInstruction = ref('')
const instructionInputRef = ref<HTMLTextAreaElement | null>(null)

// 优化列表弹框状态
const optimizeListModalVisible = ref(false)

// 是否显示预览
const showPreview = computed(() => taskSplitStore.splitResult !== null)
const refinementMode = computed(() => taskSplitStore.refinementMode)
const hasPendingRefinement = computed(() => Boolean(refinementMode.value))
const isListOptimizePending = computed(() => refinementMode.value === 'list_optimize')
const isSubSplitActive = computed(() => refinementMode.value === 'task_resplit')
const subSplitTargetTitle = computed(() => {
  if (!isSubSplitActive.value || taskSplitStore.subSplitTargetIndex === null) return ''
  const originalTasks = taskSplitStore.refinementState?.originalTasks
  const idx = taskSplitStore.subSplitTargetIndex
  return originalTasks?.[idx]?.title ?? t('taskBoard.emptyNoTasks')
})
const previewActionsDisabled = computed(() =>
  isSessionRunning.value || isConfirming.value || hasPendingRefinement.value
)
const canApplyRefinement = computed(() =>
  hasPendingRefinement.value && taskSplitStore.session?.status === 'completed'
)

const activeFormSchema = computed(() => taskSplitStore.activeFormSchema)
const isSessionRunning = computed(() => taskSplitStore.session?.status === 'running')
const showStopButton = computed(() => taskSplitStore.session?.status === 'running')
const showLoadingIndicator = computed(() => taskSplitStore.session?.status === 'running')
const canRetrySplit = computed(() => taskSplitStore.session?.status === 'failed')
const canContinueSplit = computed(() =>
  taskSplitStore.session?.status === 'stopped'
  && !activeFormSchema.value
  && (!showPreview.value || hasPendingRefinement.value)
)
const retryActionLabel = computed(() => {
  const hasUserMessage = taskSplitStore.messages.some(message =>
    message.role === 'user' && message.content.trim()
  )
  return hasUserMessage ? t('taskSplit.resendLabel') : t('taskSplit.retryLabel')
})
const splitErrorMessage = computed(() =>
  taskSplitStore.session?.errorMessage?.trim()
  || taskSplitStore.session?.parseError?.trim()
  || ''
)
const primaryActionLabel = computed(() => {
  if (refinementMode.value === 'list_optimize') {
    return canApplyRefinement.value ? t('taskSplit.applyOptimizeResult') : t('taskSplit.waitingOptimizeResult')
  }
  if (refinementMode.value === 'task_resplit') {
    return canApplyRefinement.value ? t('taskSplit.applyResplitResult') : t('taskSplit.waitingResplitResult')
  }
  return isConfirming.value ? t('taskSplit.creating') : t('taskSplit.confirmCreate')
})
const footerHint = computed(() => {
  if (canRetrySplit.value) {
    return splitErrorMessage.value || t('taskSplit.hintRetryFailed')
  }

  if (taskSplitStore.session?.status === 'stopped') {
    if (activeFormSchema.value) {
      return t('taskSplit.hintSessionStoppedWithForm')
    }
    const hasArchivedForms = taskSplitStore.logs.some(log =>
      log.type === 'content' && log.content.includes('"type": "form_request"')
    )
    return hasArchivedForms
      ? t('taskSplit.hintSessionStoppedWithHistory')
      : t('taskSplit.hintSessionStopped')
  }

  if (taskSplitStore.session?.status === 'running') {
    return t('taskSplit.hintSessionRunning')
  }

  if (taskSplitStore.session?.status === 'waiting_input' && activeFormSchema.value) {
    return t('taskSplit.hintWaitingFormInput')
  }

  if (!activeFormSchema.value && !showPreview.value) {
    return t('taskSplit.hintNoFormData')
  }

  return t('taskSplit.hintWaitingFormInput')
})

const sortedSplitLogs = computed(() => [...taskSplitStore.logs].sort((left, right) =>
  compareTimestamp(left.createdAt, right.createdAt)
))

const toolCallMap = computed(() => buildToolCallMapFromLogs(sortedSplitLogs.value, {
  fallbackStatus: isSessionRunning.value
    ? 'running'
    : taskSplitStore.session?.status === 'failed' || taskSplitStore.session?.status === 'stopped'
      ? 'error'
      : 'success'
}))

const latestRuntimeLog = computed(() => {
  if (sortedSplitLogs.value.length === 0) return null
  return sortedSplitLogs.value[sortedSplitLogs.value.length - 1] ?? null
})

const runtimeLogStatusTextResolvers: Partial<Record<PlanSplitLogRecord['type'], (log: PlanSplitLogRecord) => string>> = {
  thinking: () => t('taskSplit.runtimeThinking'),
  thinking_start: () => t('taskSplit.runtimeThinkingStart'),
  system: () => t('taskSplit.runtimeLoadingExtensions'),
  tool_use: (log) => {
    const toolCall = toolCallMap.value.get(log.id)
    return toolCall ? t('taskSplit.runtimeCallingTool', { name: toolCall.name }) : t('taskSplit.runtimeCallingToolFallback')
  },
  tool_input_delta: () => t('taskSplit.runtimeToolInputDelta'),
  content: () => t('taskSplit.runtimeGenerating'),
  tool_result: () => t('taskSplit.runtimeToolResult'),
  error: () => t('taskSplit.runtimeError')
}

const runningStatusText = computed(() => {
  if (!isSessionRunning.value) {
    return ''
  }

  const latestLog = latestRuntimeLog.value
  if (!latestLog) {
    return t('taskSplit.runtimeWaitingFirstOutput')
  }

  const resolver = runtimeLogStatusTextResolvers[latestLog.type]
  if (resolver) {
    return resolver(latestLog)
  }

  return t('taskSplit.runtimeProcessing')
})

function scrollMessagesToBottom() {
  const container = messagesContainerRef.value
  if (!container) return

  container.scrollTop = container.scrollHeight
}

function compareTimestamp(left?: string, right?: string) {
  return new Date(left || 0).getTime() - new Date(right || 0).getTime()
}

function toTimestampMs(value?: string | null) {
  if (!value) {
    return null
  }

  const timestampMs = new Date(value).getTime()
  return Number.isFinite(timestampMs) ? timestampMs : null
}

function formatElapsedLabel(durationMs: number | null) {
  if (durationMs === null || durationMs < 250) {
    return null
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
  }

  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}

function parseLogMetadata(log: PlanSplitLogRecord): Record<string, unknown> | null {
  if (!log.metadata) return null
  if (typeof log.metadata === 'string') {
    try {
      const parsed = JSON.parse(log.metadata) as Record<string, unknown>
      const rawMetadata = typeof parsed.rawMetadata === 'string'
        ? (() => {
            try {
              const nested = JSON.parse(parsed.rawMetadata) as unknown
              return nested && typeof nested === 'object' && !Array.isArray(nested)
                ? nested as Record<string, unknown>
                : null
            } catch {
              return null
            }
          })()
        : null

      return rawMetadata
        ? {
            ...rawMetadata,
            ...parsed
          }
        : parsed
    } catch {
      return null
    }
  }
  return log.metadata as unknown as Record<string, unknown>
}

function readMetadataNumber(metadata: Record<string, unknown> | null, key: string): number | undefined {
  const value = metadata?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }
  return undefined
}

function resolveUsageState(logs: PlanSplitLogRecord[]) {
  const requestedModelId = taskSplitStore.context?.modelId
    || taskSplitStore.usageModelHint
    || undefined
  const usageState: { model?: string, inputTokens?: number, outputTokens?: number } = {
    model: requestedModelId
  }

  for (const log of logs) {
    const metadata = parseLogMetadata(log)
    const reportedModel = typeof metadata?.model === 'string' && metadata.model.trim()
      ? metadata.model.trim()
      : undefined
    const inputTokens = readMetadataNumber(metadata, 'inputTokens')
    const outputTokens = readMetadataNumber(metadata, 'outputTokens')

    if (reportedModel) {
      usageState.model = resolveRecordedModelId({
        reportedModelId: reportedModel,
        requestedModelId
      }) ?? reportedModel
    }
    if (inputTokens !== undefined && (usageState.inputTokens === undefined || inputTokens >= usageState.inputTokens)) {
      usageState.inputTokens = inputTokens
    }
    if (outputTokens !== undefined && (usageState.outputTokens === undefined || outputTokens >= usageState.outputTokens)) {
      usageState.outputTokens = outputTokens
    }
  }

  return usageState
}

function buildSummaryValueMap(schema: DynamicFormSchema, content: string): Record<string, string> {
  const labelSet = new Set(schema.fields.map(field => field.label))
  const valueMap: Record<string, string> = {}
  let currentLabel = ''
  let currentValue = ''

  const flushCurrentValue = () => {
    if (!currentLabel) return
    valueMap[currentLabel] = currentValue.trim()
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd()
    const fullWidthSeparatorIndex = line.indexOf('：')
    const asciiSeparatorIndex = line.indexOf(':')
    const separatorIndex = fullWidthSeparatorIndex >= 0 ? fullWidthSeparatorIndex : asciiSeparatorIndex
    const candidateLabel = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : ''

    if (candidateLabel && labelSet.has(candidateLabel)) {
      flushCurrentValue()
      currentLabel = candidateLabel
      currentValue = line.slice(separatorIndex + 1).trim()
      continue
    }

    if (currentLabel) {
      currentValue = [currentValue, line.trim()].filter(Boolean).join('\n')
    }
  }

  flushCurrentValue()
  return valueMap
}

function parseFieldSummaryValue(
  field: DynamicFormSchema['fields'][number],
  rawValue?: string
): unknown {
  const normalizedValue = rawValue?.trim()
  if (!normalizedValue || normalizedValue === '-') {
    if (field.type === 'multiselect') return []
    if (field.type === 'checkbox') return false
    return ''
  }

  const parseOptionValue = (value: string) => {
    const matchedOption = field.options?.find(option =>
      String(option.label).trim() === value || String(option.value).trim() === value
    )
    return matchedOption ? matchedOption.value : value
  }

  switch (field.type) {
    case 'select':
    case 'radio':
      return parseOptionValue(normalizedValue)
    case 'multiselect':
      return normalizedValue
        .split(/[、,，]/)
        .map(item => item.trim())
        .filter(Boolean)
        .map(parseOptionValue)
    case 'number':
    case 'slider': {
      const numericValue = Number(normalizedValue)
      return Number.isFinite(numericValue) ? numericValue : normalizedValue
    }
    case 'checkbox':
      return ['true', '1', 'yes', 'on', 'checked', '是'].includes(normalizedValue.toLowerCase())
    default:
      return normalizedValue
  }
}

function formatFieldSummaryValue(
  field: DynamicFormSchema['fields'][number],
  value: unknown
): string {
  if (value === undefined || value === null || value === '') return '-'
  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    return value.map(item => formatFieldSummaryValue(field, item)).join('、')
  }

  const matchedOption = field.options?.find(option => option.value === value)
  return matchedOption ? matchedOption.label : String(value)
}

function summarizeFormValues(
  schema: DynamicFormSchema,
  values: Record<string, unknown>
): string {
  return schema.fields
    .map(field => `${field.label}：${formatFieldSummaryValue(field, values[field.name])}`)
    .join('\n')
}

function normalizeMultilineText(value?: string | null): string {
  return (value ?? '')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
}

function resolveMessageTimestampDistance(left?: string, right?: string): number {
  const leftMs = toTimestampMs(left)
  const rightMs = toTimestampMs(right)
  if (leftMs === null || rightMs === null) {
    return Number.MAX_SAFE_INTEGER
  }

  return Math.abs(leftMs - rightMs)
}

function buildFormValuesFromMessage(schema: DynamicFormSchema, messageContent: string): Record<string, unknown> {
  const summaryValueMap = buildSummaryValueMap(schema, messageContent)
  const values: Record<string, unknown> = {}

  for (const field of schema.fields) {
    values[field.name] = parseFieldSummaryValue(field, summaryValueMap[field.label])
  }

  return values
}

interface FormRequestSnapshot {
  formId: string
  schema: DynamicFormSchema
  promptText?: string
  requestedAt: string
}

interface FormRequestTurn {
  requestedAt: string
  promptText?: string
  forms: FormRequestSnapshot[]
}

function sortTimelineEntries(entries: TimelineEntry[]) {
  entries.sort((left, right) => {
    const timeDiff = compareTimestamp(left.timestamp, right.timestamp)
    if (timeDiff !== 0) {
      return timeDiff
    }

    const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER
    const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER
    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence
    }

    return left.id.localeCompare(right.id)
  })
}

function extractFormRequestTurnFromLog(log: PlanSplitLogRecord): FormRequestTurn | null {
  const toTurn = (
    payload: Record<string, unknown>,
    requestedAt: string
  ): FormRequestTurn | null => {
    const schemas = extractDynamicFormSchemas(payload)
    if (schemas.length === 0) {
      return null
    }

    const promptText = typeof payload.question === 'string' ? payload.question.trim() : undefined
    return {
      requestedAt,
      promptText,
      forms: schemas.map(schema => ({
        formId: schema.formId,
        schema,
        promptText,
        requestedAt
      }))
    }
  }

  if (log.type === 'content') {
    try {
      return toTurn(JSON.parse(log.content) as Record<string, unknown>, log.createdAt)
    } catch {
      return null
    }
  }

  const toolCall = toolCallMap.value.get(log.id)
  if (!toolCall) {
    return null
  }

  const isStructuredOutput = toolCall.name.toLowerCase() === 'structuredoutput'
    || toolCall.name.toLowerCase() === 'structured_output'
  if (!isStructuredOutput) {
    return null
  }

  return toTurn(toolCall.arguments, log.createdAt)
}

const formRequestTurns = computed<FormRequestTurn[]>(() => {
  const turns: FormRequestTurn[] = []

  for (const log of sortedSplitLogs.value) {
    const turn = extractFormRequestTurnFromLog(log)
    if (turn) {
      turns.push(turn)
    }
  }

  return turns
})

const formRequestHistory = computed<FormRequestSnapshot[]>(() =>
  formRequestTurns.value.flatMap(turn => turn.forms)
)

const activeFormRequestedAt = computed(() => {
  const activeFormId = activeFormSchema.value?.formId
  if (!activeFormId) {
    return null
  }

  for (let index = formRequestTurns.value.length - 1; index >= 0; index -= 1) {
    const turn = formRequestTurns.value[index]
    if (turn.forms.some(form => form.formId === activeFormId)) {
      return turn.requestedAt
    }
  }

  return taskSplitStore.session?.updatedAt || new Date().toISOString()
})

function shouldSuppressStructuredContentLog(log: PlanSplitLogRecord) {
  if (log.type !== 'content' || !log.content.trim()) {
    return false
  }

  if (extractFirstFormRequest(log.content)) {
    return true
  }

  return showPreview.value && Boolean(extractTaskSplitResult(log.content))
}

function isContextSystemLog(log: PlanSplitLogRecord) {
  if (log.type !== 'system' || !log.content.trim()) {
    return false
  }

  const notice = buildRuntimeNoticeFromSystemContent(log.content)
  return notice ? isContextRuntimeNotice(notice) : false
}

const visibleRuntimeNotices = computed(() =>
  taskSplitStore.runtimeNotices.filter(notice => !isContextRuntimeNotice(notice))
)

const hasRuntimeSystemLog = computed(() =>
  taskSplitStore.logs.some(log =>
    log.type === 'system'
    && log.content.trim()
    && !isContextSystemLog(log)
  )
)

const usageNoticeEntry = computed<TimelineEntry | null>(() => {
  const usageLogs = sortedSplitLogs.value.filter(log => {
    const metadata = parseLogMetadata(log)
    return log.type === 'usage'
      || log.type === 'message_start'
      || typeof metadata?.model === 'string'
      || readMetadataNumber(metadata, 'inputTokens') !== undefined
      || readMetadataNumber(metadata, 'outputTokens') !== undefined
  })

  const usageState = resolveUsageState(sortedSplitLogs.value)

  const notice = buildUsageNotice(usageState)
  if (!notice) return null

  const latestUsageLog = usageLogs[usageLogs.length - 1]
  return {
    id: `usage-${latestUsageLog?.id || 'runtime'}`,
    type: 'system',
    content: `### ${notice.title}\n${notice.content}`,
    timestamp: latestUsageLog?.createdAt || taskSplitStore.session?.updatedAt,
    runtimeFallbackUsage: usageState
  }
})

const sessionElapsedLabel = computed(() => {
  const sessionStartMs = toTimestampMs(taskSplitStore.session?.startedAt || taskSplitStore.session?.createdAt)
  const sessionEndMs = toTimestampMs(
    taskSplitStore.session?.completedAt
      || taskSplitStore.session?.stoppedAt
      || (!isSessionRunning.value ? taskSplitStore.session?.updatedAt : null)
  )

  if (sessionStartMs === null || sessionEndMs === null) {
    const runtimeMetrics = taskSplitStore.runtimeMetrics
    if (runtimeMetrics?.doneAt !== undefined) {
      return formatElapsedLabel(Math.max(0, runtimeMetrics.doneAt - runtimeMetrics.startedAt))
    }
    return null
  }

  return formatElapsedLabel(Math.max(0, sessionEndMs - sessionStartMs))
})

function attachSessionElapsedLabel(entries: TimelineEntry[]) {
  const elapsedLabel = sessionElapsedLabel.value
  if (!elapsedLabel) {
    return
  }

  const activeFormEntry = [...entries].reverse().find(entry =>
    entry.type === 'form'
    && entry.formVariant === 'active'
    && entry.formSchema?.formId === activeFormSchema.value?.formId
  )
  if (activeFormEntry) {
    activeFormEntry.metaLabel = elapsedLabel
    return
  }

  const lastRenderableEntry = [...entries].reverse().find(entry => entry.role !== 'user')
  if (lastRenderableEntry) {
    lastRenderableEntry.metaLabel = elapsedLabel
  }
}

const historicalSubmittedForms = computed(() => {
  const derivedSnapshots: Array<{
    formId: string
    schema: DynamicFormSchema
    promptText?: string
    requestedAt: string
    values: Record<string, unknown>
    submittedAt: string
    sourceMessageId?: string
  }> = []
  const sortedMessages = [...taskSplitStore.messages].sort((left, right) =>
    compareTimestamp(left.timestamp, right.timestamp)
  )
  let formQueueIndex = 0
  let latestAssistantPrompt = ''

  for (const message of sortedMessages) {
    if (message.role === 'assistant') {
      latestAssistantPrompt = message.content.trim()
      continue
    }
    if (message.role !== 'user') continue
    const pendingForm = formRequestHistory.value[formQueueIndex]
    if (!pendingForm) break
    if (compareTimestamp(message.timestamp, pendingForm.requestedAt) < 0) {
      continue
    }

    derivedSnapshots.push({
      formId: pendingForm.schema.formId,
      schema: pendingForm.schema,
      promptText: latestAssistantPrompt || undefined,
      requestedAt: pendingForm.requestedAt,
      values: buildFormValuesFromMessage(pendingForm.schema, message.content),
      submittedAt: message.timestamp,
      sourceMessageId: message.id
    })
    formQueueIndex += 1
  }

  const mergedSnapshots = new Map<string, typeof derivedSnapshots[number]>()

  for (const snapshot of derivedSnapshots) {
    mergedSnapshots.set(snapshot.formId, snapshot)
  }

  for (const snapshot of taskSplitStore.submittedForms) {
    const derivedSnapshot = mergedSnapshots.get(snapshot.formId)
    const normalizedSummary = normalizeMultilineText(summarizeFormValues(snapshot.schema, snapshot.values))
    const matchedMessage = sortedMessages
      .filter(message => message.role === 'user' && normalizeMultilineText(message.content) === normalizedSummary)
      .sort((left, right) =>
        resolveMessageTimestampDistance(left.timestamp, snapshot.submittedAt)
        - resolveMessageTimestampDistance(right.timestamp, snapshot.submittedAt)
      )[0]

    mergedSnapshots.set(snapshot.formId, {
      formId: snapshot.formId,
      schema: snapshot.schema,
      promptText: snapshot.promptText,
      requestedAt: derivedSnapshot?.requestedAt || snapshot.submittedAt,
      values: snapshot.values,
      submittedAt: snapshot.submittedAt,
      sourceMessageId: derivedSnapshot?.sourceMessageId || matchedMessage?.id
    })
  }

  return Array.from(mergedSnapshots.values()).sort((left, right) =>
    compareTimestamp(left.submittedAt, right.submittedAt)
  )
})

const timelineEntries = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  const activeFormId = activeFormSchema.value?.formId ?? null
  const sortedMessages = [...taskSplitStore.messages].sort((left, right) =>
    compareTimestamp(left.timestamp, right.timestamp)
  )
  const submittedMessageIds = new Set(
    historicalSubmittedForms.value
      .map(item => item.sourceMessageId)
      .filter((messageId): messageId is string => Boolean(messageId))
  )
  const activeFormPrompt = [...sortedMessages]
    .slice()
    .reverse()
    .find(message => message.role === 'assistant' && message.content.trim())
    ?.content
    ?.trim()
  const animateLiveEntries = isSessionRunning.value
  let lastThinkingEntry: TimelineEntry | null = null
  let lastAssistantContentEntry: TimelineEntry | null = null
  let nextSequence = 0

  const pushEntry = (entry: TimelineEntry) => {
    entries.push({
      ...entry,
      sequence: nextSequence++
    })
  }

  for (const message of sortedMessages) {
    if (!message.content.trim() || submittedMessageIds.has(message.id)) {
      continue
    }
    // 用户消息：直接展示
    if (message.role === 'user') {
      pushEntry({
        id: `message-${message.id}`,
        type: 'message',
        role: message.role,
        content: message.content,
        timestamp: message.timestamp
      })
    } else if (message.role === 'assistant' && !message.formSchema) {
      // assistant 消息：仅展示非表单类的指令操作结果
      pushEntry({
        id: `message-${message.id}`,
        type: 'message',
        role: message.role,
        content: message.content,
        timestamp: message.timestamp
      })
    }
  }

  if (!hasRuntimeSystemLog.value) {
    for (const notice of visibleRuntimeNotices.value) {
      pushEntry({
        id: `runtime-notice-${notice.id}`,
        type: 'system',
        content: `### ${notice.title}\n${notice.content}`,
        timestamp: taskSplitStore.session?.startedAt || taskSplitStore.session?.createdAt
      })
    }
  }

  if (usageNoticeEntry.value) {
    pushEntry(usageNoticeEntry.value)
  }

  for (const log of sortedSplitLogs.value) {
    if (!['content', 'thinking', 'thinking_start', 'tool_use', 'tool_input_delta', 'tool_result', 'usage', 'message_start', 'error', 'system'].includes(log.type)) {
      lastThinkingEntry = null
      lastAssistantContentEntry = null
      continue
    }

    if (log.type === 'content' && log.content) {
      if (shouldSuppressStructuredContentLog(log)) {
        lastThinkingEntry = null
        lastAssistantContentEntry = null
        continue
      }

      if (lastAssistantContentEntry) {
        lastAssistantContentEntry.content = `${lastAssistantContentEntry.content || ''}${log.content}`
        lastAssistantContentEntry.timestamp = log.createdAt
        lastAssistantContentEntry.animate = animateLiveEntries
      } else {
        const contentEntry: TimelineEntry = {
          id: `content-${log.id}`,
          type: 'content',
          role: 'assistant',
          content: log.content,
          timestamp: log.createdAt,
          animate: animateLiveEntries
        }
        pushEntry(contentEntry)
        lastAssistantContentEntry = contentEntry
      }

      lastThinkingEntry = null
      continue
    }

    if (log.type === 'thinking_start') {
      if (!lastThinkingEntry) {
        const thinkingEntry: TimelineEntry = {
          id: `log-${log.id}`,
          type: 'thinking',
          content: '',
          timestamp: log.createdAt,
          animate: animateLiveEntries
        }
        pushEntry(thinkingEntry)
        lastThinkingEntry = thinkingEntry
      }
      continue
    }

    if (log.type === 'thinking') {
      if (lastThinkingEntry) {
        lastThinkingEntry.content = [lastThinkingEntry.content, log.content].filter(Boolean).join('\n')
        lastThinkingEntry.timestamp = log.createdAt
        lastThinkingEntry.animate = animateLiveEntries
        continue
      }

      const thinkingEntry: TimelineEntry = {
        id: `log-${log.id}`,
        type: 'thinking',
        content: log.content,
        timestamp: log.createdAt,
        animate: animateLiveEntries
      }
      pushEntry(thinkingEntry)
      lastThinkingEntry = thinkingEntry
      lastAssistantContentEntry = null
      continue
    }

    lastThinkingEntry = null
    lastAssistantContentEntry = null

    if (log.type === 'system') {
      if (isContextSystemLog(log)) {
        continue
      }

      pushEntry({
        id: `system-${log.id}`,
        type: 'system',
        content: log.content,
        timestamp: log.createdAt
      })
      continue
    }

    if (log.type === 'tool_use') {
      const toolCall = toolCallMap.value.get(log.id)
      if (!toolCall) continue
      const normalizedToolName = toolCall.name.toLowerCase()
      const isStructuredOutput = normalizedToolName === 'structuredoutput'
        || normalizedToolName === 'structured_output'
      const hasFormOutput = Boolean(extractFormRequestTurnFromLog(log))

      if (isStructuredOutput && hasFormOutput) {
        continue
      }

      pushEntry({
        id: `tool-${log.id}`,
        type: 'tool',
        toolCall,
        timestamp: log.createdAt,
        animate: animateLiveEntries,
        toolCompact: isStructuredOutput,
        toolDefaultExpanded: isStructuredOutput ? false : undefined,
        toolDefaultResultExpanded: isStructuredOutput ? false : undefined
      })
      continue
    }

    if (log.type === 'tool_result') {
      continue
    }

    if (log.type === 'tool_input_delta') {
      continue
    }

    if (log.type === 'usage' || log.type === 'message_start') {
      continue
    }

    pushEntry({
      id: `log-${log.id}`,
      type: log.type === 'error' ? 'error' : 'system',
      content: log.content,
      timestamp: log.createdAt,
      animate: animateLiveEntries
    })
  }

  for (const submittedForm of historicalSubmittedForms.value) {
    pushEntry({
      id: `submitted-form-${submittedForm.formId}-${submittedForm.submittedAt}`,
      type: 'form',
      formSchema: submittedForm.schema,
      formPrompt: submittedForm.promptText,
      formInitialValues: submittedForm.values,
      formDisabled: true,
      formVariant: 'submitted',
      timestamp: submittedForm.submittedAt
    })
  }

  const requestedFormIds = new Set<string>()
  for (const submittedForm of historicalSubmittedForms.value) {
    requestedFormIds.add(submittedForm.formId)
  }
  if (activeFormId) {
    requestedFormIds.add(activeFormId)
  }

  for (const turn of formRequestTurns.value) {
    const pendingForm = turn.forms.find(form => !requestedFormIds.has(form.formId))
    if (!pendingForm) {
      continue
    }

    pushEntry({
      id: `archived-form-${pendingForm.formId}-${pendingForm.requestedAt}`,
      type: 'form',
      formSchema: pendingForm.schema,
      formPrompt: pendingForm.promptText,
      formDisabled: true,
      formVariant: 'archived',
      timestamp: pendingForm.requestedAt
    })
  }

  if (activeFormSchema.value && (!showPreview.value || hasPendingRefinement.value)) {
    pushEntry({
      id: `form-${activeFormSchema.value.formId}`,
      type: 'form',
      formSchema: activeFormSchema.value,
      formPrompt: activeFormPrompt,
      formDisabled: taskSplitStore.isProcessing,
      formVariant: 'active',
      timestamp: activeFormRequestedAt.value || taskSplitStore.session?.updatedAt || new Date().toISOString()
    })
  }

  sortTimelineEntries(entries)
  attachSessionElapsedLabel(entries)

  return entries
})

const messageRenderState = computed(() => {
  const latestEntry = timelineEntries.value[timelineEntries.value.length - 1]
  return [
    planStore.splitDialogVisible,
    timelineEntries.value.length,
    latestEntry?.id ?? '',
    latestEntry?.type ?? '',
    latestEntry?.timestamp ?? '',
    latestEntry?.content?.length ?? 0,
    latestEntry?.toolCall?.status ?? '',
    latestEntry?.toolCall?.result?.length ?? 0,
    latestEntry?.formSchema?.formId ?? '',
    taskSplitStore.isProcessing,
    activeFormSchema.value?.formId ?? '',
    showPreview.value
  ].join('|')
})

async function initializeDialogSession() {
  const dialogContext = planStore.splitDialogContext
  if (!dialogContext) return

  try {
    await agentTeamsStore.loadExperts()
    const existingPlan = planStore.plans.find(p => p.id === dialogContext.planId)
    const plan = existingPlan || await planStore.getPlan(dialogContext.planId)
    if (!plan) return

    const project = projectStore.projects.find(p => p.id === plan.projectId)
    await taskSplitStore.initSession({
      planId: plan.id,
      planName: plan.name,
      planDescription: plan.description,
      granularity: plan.granularity,
      expertId: dialogContext.expertId || plan.splitExpertId,
      agentId: dialogContext.agentId,
      modelId: dialogContext.modelId,
      workingDirectory: project?.path
    })
  } catch (error) {
    logger.error('[TaskSplitDialog] Failed to initialize session:', error)
  }
}

// 重新拆分（清理当前状态，开始新会话）
async function restartSplit() {
  const dialogContext = planStore.splitDialogContext
  if (!dialogContext) return

  if (showStopButton.value) {
    await taskSplitStore.stop()
  }
  await taskSplitStore.clearPlanSplitSessions(dialogContext.planId)
  taskSplitStore.reset()

  // 开始新会话
  await initializeDialogSession()
}

async function handleFormSubmit(values: Record<string, any>) {
  if (!activeFormSchema.value) return
  try {
    await taskSplitStore.submitFormResponse(activeFormSchema.value.formId, values)
  } catch (error) {
    logger.error('[TaskSplitDialog] Failed to submit task split form:', error)
  }
}

function handleTimelineFormSubmit(_entryId: string, values: Record<string, unknown>) {
  void handleFormSubmit(values as Record<string, any>)
}

function handleOptimizeList() {
  optimizeListModalVisible.value = true
}

async function handleOptimizeListConfirm(config: TaskListOptimizeConfig) {
  optimizeListModalVisible.value = false
  await taskSplitStore.startListOptimize(config)
}

// 确认拆分结果
async function confirmSplit() {
  const splitContext = planStore.splitDialogContext
  if (!taskSplitStore.splitResult || !splitContext || isConfirming.value) return

  // 如果是子拆分模式，先合并结果
  if (refinementMode.value === 'task_resplit') {
    await taskSplitStore.completeSubSplit(taskSplitStore.splitResult)
    return // 合并后继续显示更新后的任务列表，不关闭弹框
  }
  if (refinementMode.value === 'list_optimize') {
    await taskSplitStore.completeListOptimize(taskSplitStore.splitResult)
    return
  }

  const planId = splitContext.planId
  isConfirming.value = true

  try {
    await Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadExperts()
    ])

    const fallbackExpert = agentTeamsStore.builtinDeveloperExpert
      || agentTeamsStore.enabledExperts.find(expert => expert.category === 'developer')
      || agentTeamsStore.enabledExperts[0]
      || null

    const taskInputs = taskSplitStore.splitResult.map((task, index) => {
      const selectedExpert = resolveExpertById(task.expertId, agentTeamsStore.experts) || fallbackExpert
      const runtime = resolveExpertRuntime(selectedExpert, agentStore.agents, task.modelId)

      return {
        planId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        expertId: selectedExpert?.id,
        agentId: runtime?.agent.id || task.agentId,
        modelId: runtime?.modelId || task.modelId,
        implementationSteps: task.implementationSteps,
        testSteps: task.testSteps,
        acceptanceCriteria: task.acceptanceCriteria,
        dependsOn: task.dependsOn, // 传递依赖关系（任务标题列表）
        order: index
      }
    })

    await taskStore.createTasksFromSplit(planId, taskInputs)

    await taskStore.loadTasks(planId)

    await planStore.markPlanAsReady(planId)
    planStore.setCurrentPlan(planId)

    await taskSplitStore.clearPlanSplitSessions(planId)

    // 重置并关闭对话框
    taskSplitStore.reset()
    planStore.closeSplitDialog()
  } catch (error) {
    console.error('Failed to confirm split:', error)
  } finally {
    isConfirming.value = false
  }
}

async function closeDialog() {
  if (hasPendingRefinement.value) {
    if (showStopButton.value) {
      await taskSplitStore.stop()
    }
    await taskSplitStore.cancelRefinement({ discardSession: true })
  }
  taskSplitStore.detach()
  planStore.closeSplitDialog()
}

async function stopSplitTask() {
  await taskSplitStore.stop()
}

async function retrySplitTask() {
  await taskSplitStore.retry()
}

async function continueSplitTask() {
  await taskSplitStore.continueSession()
}

/**
 * 将用户指令和操作结果追加到 messages 中，使其在左侧对话流可见。
 * 仅对简单操作（删除/添加/修改/移动）添加消息；再拆分由 startSubSplit 内部通过 uiMessages 和 logs 处理。
 */
function pushInstructionMessages(userContent: string, assistantContent: string) {
  const now = new Date().toISOString()
  const userMsg: SplitMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: userContent,
    timestamp: now
  }
  const assistantMsg: SplitMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: assistantContent,
    timestamp: new Date(Date.now() + 1).toISOString() // 确保 assistant 在 user 之后
  }
  taskSplitStore.messages.push(userMsg, assistantMsg)
}

/**
 * 解析用户自然语言指令并调用对应的 store 方法操作任务列表。
 * 支持的指令格式：
 *   - 删除任务 N / 移除任务 N
 *   - 添加任务 / 新增任务
 *   - 修改任务 N 的标题为 XXX / 修改任务 N 的描述为 XXX / 修改任务 N 的优先级为高/中/低
 *   - 再次拆分任务 N / 拆分任务 N
 *   - 上移任务 N / 下移任务 N
 */
function handleUserInstruction() {
  const text = userInstruction.value.trim()
  if (!text || !taskSplitStore.splitResult) return

  const tasks = taskSplitStore.splitResult

  // 解析任务编号（1-based）
  const resolveIndex = (matched: string | undefined): number | null => {
    if (!matched) return null
    const num = parseInt(matched, 10)
    if (Number.isFinite(num) && num >= 1 && num <= tasks.length) return num - 1
    return null
  }

  // 按标题模糊匹配任务编号
  const resolveIndexByTitle = (keyword: string): number | null => {
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].title.includes(keyword)) return i
    }
    return null
  }

  let handled = false
  let resultText = ''

  // 删除任务 N
  {
    const match = text.match(/(?:删除|移除|去掉)\s*(?:任务\s*)?(\d+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      if (idx !== null) {
        const title = tasks[idx].title
        taskSplitStore.removeSplitTask(idx)
        resultText = t('taskSplit.instructionDeleted', { index: idx + 1, title })
        handled = true
      }
    }
  }

  // 添加任务
  if (!handled && /(?:添加|新增|增加)\s*(?:一个\s*)?(?:新\s*)?任务/.test(text)) {
    taskSplitStore.addSplitTask()
    resultText = t('taskSplit.instructionAdded')
    handled = true
  }

  // 再次拆分任务 N（由 startSubSplit 内部管理 uiMessages，此处仅追加用户消息）
  if (!handled) {
    const match = text.match(/(?:再次?拆分|继续拆分)\s*(?:任务\s*)?(\d+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      if (idx !== null) {
        // 仅追加用户消息，assistant 消息由 AI 处理过程的 logs 自动展示
        const userMsg: SplitMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          timestamp: new Date().toISOString()
        }
        taskSplitStore.messages.push(userMsg)
        taskSplitStore.startSubSplit(idx, {
          taskIndex: idx,
          granularity: taskSplitStore.context?.granularity || DEFAULT_SPLIT_GRANULARITY,
          expertId: taskSplitStore.context?.expertId,
          modelId: taskSplitStore.context?.modelId
        })
        handled = true
      }
    }
  }

  // 修改任务 N 的标题/描述/优先级
  if (!handled) {
    const match = text.match(/(?:修改|更新|更改)\s*(?:任务\s*)?(\d+)\s*的(?:标题|名称)\s*为\s*(.+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      if (idx !== null) {
        const newTitle = match[2].trim()
        taskSplitStore.updateSplitTask(idx, { title: newTitle })
        resultText = t('taskSplit.instructionTitleUpdated', { index: idx + 1, title: newTitle })
        handled = true
      }
    }
  }

  if (!handled) {
    const match = text.match(/(?:修改|更新|更改)\s*(?:任务\s*)?(\d+)\s*的描述\s*为\s*(.+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      if (idx !== null) {
        const newDesc = match[2].trim()
        taskSplitStore.updateSplitTask(idx, { description: newDesc })
        resultText = t('taskSplit.instructionDescUpdated', { index: idx + 1 })
        handled = true
      }
    }
  }

  if (!handled) {
    const match = text.match(/(?:修改|更新|更改)\s*(?:任务\s*)?(\d+)\s*的?优先级?\s*为\s*(.+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      const raw = match[2].trim()
      const priorityMap: Record<string, string> = { '高': 'high', '低': 'low', '中': 'medium', 'high': 'high', 'low': 'low', 'medium': 'medium' }
      const priority = priorityMap[raw.toLowerCase()] || 'medium'
      if (idx !== null) {
        taskSplitStore.updateSplitTask(idx, { priority: priority as AITaskItem['priority'] })
        resultText = t('taskSplit.instructionPriorityUpdated', { index: idx + 1, priority: raw })
        handled = true
      }
    }
  }

  // 上移/下移任务 N
  if (!handled) {
    const match = text.match(/(?:上移|往前移)\s*(?:任务\s*)?(\d+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      if (idx !== null && idx > 0) {
        const title = tasks[idx].title
        const temp = tasks[idx]
        tasks.splice(idx, 1)
        tasks.splice(idx - 1, 0, temp)
        resultText = t('taskSplit.instructionMovedUp', { index: idx + 1, title })
        handled = true
      }
    }
  }

  if (!handled) {
    const match = text.match(/(?:下移|往后移)\s*(?:任务\s*)?(\d+)/)
    if (match) {
      const idx = resolveIndex(match[1])
      if (idx !== null && idx < tasks.length - 1) {
        const title = tasks[idx].title
        const temp = tasks[idx]
        tasks.splice(idx, 1)
        tasks.splice(idx + 1, 0, temp)
        resultText = t('taskSplit.instructionMovedDown', { index: idx + 1, title })
        handled = true
      }
    }
  }

  // 按标题模糊删除
  if (!handled) {
    const match = text.match(/(?:删除|移除)\s*(?:任务\s*)?[\"""'](.+?)[\"""']/)
    if (match) {
      const idx = resolveIndexByTitle(match[1])
      if (idx !== null) {
        const title = tasks[idx].title
        taskSplitStore.removeSplitTask(idx)
        resultText = t('taskSplit.instructionDeletedByTitle', { title })
        handled = true
      }
    }
  }

  if (handled && resultText) {
    pushInstructionMessages(text, resultText)
  }

  if (!handled) {
    logger.warn('[TaskSplitDialog] Unrecognized instruction:', text)
  }

  userInstruction.value = ''
  nextTick(autoResizeInput)
}

/**
 * textarea 高度自适应：1～4 行
 */
function autoResizeInput() {
  const el = instructionInputRef.value
  if (!el) return
  el.style.height = 'auto'
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
  const maxH = lineHeight * 4 + 16
  el.style.height = `${Math.min(el.scrollHeight, maxH)}px`
}

// 监听对话框打开
watch(() => planStore.splitDialogVisible, async (visible) => {
  if (visible) {
    await initializeDialogSession()
    await nextTick()
    scrollMessagesToBottom()
  } else {
    taskSplitStore.detach()
  }
})

watch(messageRenderState, async () => {
  await nextTick()
  scrollMessagesToBottom()
}, { flush: 'post' })

const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(closeDialog)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="planStore.splitDialogVisible"
      class="split-dialog-overlay"
      :class="{ 'split-dialog-overlay--dark': isDarkTheme }"
      @pointerdown.capture="handleOverlayPointerDown"
      @click.self="handleOverlayClick"
    >
      <div
        class="split-dialog"
        :class="{ 'split-dialog--dark': isDarkTheme }"
      >
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">✂️</span>
            {{ t('taskSplit.dialogTitle') }}
          </h4>
          <button
            class="btn-close"
            @click="closeDialog"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <div class="split-content">
            <div class="conversation-pane">
              <div
                ref="messagesContainerRef"
                class="messages-container"
              >
                <ExecutionTimeline
                  :entries="timelineEntries"
                  group-tool-calls
                  :form-cancel-text="t('taskSplit.hide')"
                  @form-submit="handleTimelineFormSubmit"
                  @form-cancel="closeDialog"
                  @message-form-submit="(_formId, values) => handleTimelineFormSubmit('', values)"
                />

                <div
                  v-if="showLoadingIndicator"
                  class="message assistant"
                >
                  <div class="message-content loading">
                    <span class="dot" />
                    <span class="dot" />
                    <span class="dot" />
                  </div>
                  <div class="message-loading-status">
                    {{ runningStatusText }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="showPreview"
              class="preview-pane"
            >
              <div
                v-if="isSubSplitActive && isSessionRunning"
                class="preview-resplit-overlay"
              >
                <div class="resplit-overlay-spinner" />
                <span class="resplit-overlay-text">{{ t('taskSplit.resplitInProgress', { title: subSplitTargetTitle }) }}</span>
              </div>
              <TaskSplitPreview
                :tasks="taskSplitStore.splitResult!"
                :disable-actions="previewActionsDisabled"
                :is-optimizing-list="isListOptimizePending && isSessionRunning"
                @update="taskSplitStore.updateSplitTask"
                @remove="taskSplitStore.removeSplitTask"
                @add="taskSplitStore.addSplitTask"
                @optimize-list="handleOptimizeList"
              />
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <!-- 有预览时：输入栏 + 操作按钮 -->
          <template v-if="showPreview">
            <div
              v-if="isSubSplitActive && isSessionRunning"
              class="footer-resplit-hint"
            >
              <span class="resplit-hint-spinner" />
              <span>{{ t('taskSplit.resplitInProgressHint', { title: subSplitTargetTitle }) }}</span>
            </div>
            <div class="footer-input-bar">
              <div class="input-wrapper">
                <textarea
                  ref="instructionInputRef"
                  v-model="userInstruction"
                  class="instruction-input"
                  :disabled="isSessionRunning || isConfirming"
                  :placeholder="t('taskSplit.instructionPlaceholder')"
                  rows="1"
                  @keydown.enter.exact.prevent="handleUserInstruction"
                  @input="autoResizeInput"
                />
              </div>
              <button
                class="btn btn-send"
                :disabled="isSessionRunning || isConfirming || !userInstruction.trim()"
                @click="handleUserInstruction"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
            <div class="footer-actions footer-actions--confirm">
              <button
                v-if="hasPendingRefinement"
                class="btn btn-secondary"
                @click="closeDialog"
              >
                {{ t(refinementMode === 'list_optimize' ? 'taskSplit.discardOptimize' : 'taskSplit.discardResplit') }}
              </button>
              <button
                v-if="showStopButton"
                class="btn btn-danger"
                @click="stopSplitTask"
              >
                {{ t('taskSplit.stopTask') }}
              </button>
              <button
                v-if="canRetrySplit"
                class="btn btn-secondary btn-retry"
                @click="retrySplitTask"
              >
                {{ retryActionLabel }}
              </button>
              <button
                v-if="canContinueSplit"
                class="btn btn-secondary btn-continue"
                @click="continueSplitTask"
              >
                {{ t('taskSplit.continueSplit') }}
              </button>
              <button
                class="btn btn-secondary"
                :disabled="isConfirming || isSessionRunning"
                @click="closeDialog"
              >
                {{ t('taskSplit.close') }}
              </button>
              <button
                class="btn btn-secondary"
                :disabled="isSessionRunning"
                @click="restartSplit"
              >
                {{ t('taskSplit.restart') }}
              </button>
              <button
                class="btn btn-primary"
                :disabled="isConfirming || isSessionRunning || (hasPendingRefinement && !canApplyRefinement)"
                @click="confirmSplit"
              >
                {{ primaryActionLabel }}
              </button>
            </div>
          </template>

          <!-- 无预览时：提示 + 操作按钮（保持原有行为） -->
          <template v-else>
            <div class="footer-bar">
              <span
                class="idle-hint"
                :class="{ 'idle-hint--error': canRetrySplit }"
              >
                {{ footerHint }}
              </span>
              <div class="footer-actions">
                <button
                  v-if="canRetrySplit"
                  class="btn btn-secondary btn-retry"
                  @click="retrySplitTask"
                >
                  {{ retryActionLabel }}
                </button>
                <button
                  v-if="canContinueSplit"
                  class="btn btn-secondary btn-continue"
                  @click="continueSplitTask"
                >
                  {{ t('taskSplit.continueSplit') }}
                </button>
                <button
                  v-if="showStopButton"
                  class="btn btn-danger"
                  @click="stopSplitTask"
                >
                  {{ t('taskSplit.stopTask') }}
                </button>
                <button
                  class="btn btn-secondary"
                  @click="closeDialog"
                >
                  {{ t('taskSplit.hide') }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <TaskListOptimizeModal
      v-model:visible="optimizeListModalVisible"
      :task-count="taskSplitStore.splitResult?.length || 0"
      :default-expert-id="taskSplitStore.context?.expertId"
      :default-model-id="taskSplitStore.context?.modelId"
      @confirm="handleOptimizeListConfirm"
    />
  </Teleport>
</template>

<style scoped>
.split-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-bg-overlay, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-backdrop, 1040);
  backdrop-filter: blur(4px);
}

.split-dialog {
  --split-dialog-bg:
    radial-gradient(circle at 12% 0%, rgba(14, 165, 233, 0.12), transparent 26%),
    radial-gradient(circle at 88% 100%, rgba(99, 102, 241, 0.1), transparent 30%),
    var(--color-surface, #fff);
  --split-dialog-border: rgba(148, 163, 184, 0.2);
  --split-dialog-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
  --split-dialog-header-bg-color: rgba(255, 255, 255, 0.92);
  --split-dialog-header-bg: linear-gradient(90deg, rgba(239, 246, 255, 0.92), rgba(238, 242, 255, 0.9));
  --split-dialog-footer-bg: linear-gradient(180deg, #f8fbff, #f1f5ff);
  --split-pane-bg: var(--color-surface, #fff);
  --split-pane-border: rgba(125, 148, 188, 0.22);
  --split-pane-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  --split-messages-bg:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.06), transparent 42%),
    linear-gradient(to bottom, var(--color-bg-secondary, #f8fafc), var(--color-surface, #fff) 35%);
  --split-assistant-message-bg: linear-gradient(180deg, #ffffff, #f8fbff);
  --split-assistant-message-border: rgba(148, 163, 184, 0.26);
  --split-assistant-message-text: var(--color-text-primary, #1e293b);
  --split-loading-text: var(--color-text-secondary, #64748b);
  background-color: var(--color-surface, #fff);
  border-radius: 1.15rem;
  width: min(96vw, 92rem);
  max-width: 92rem;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--split-dialog-shadow);
  animation: dialogIn 0.2s var(--easing-out);
  border: 1px solid var(--split-dialog-border);
  background: var(--split-dialog-bg);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
  background-color: var(--split-dialog-header-bg-color);
  background-image: var(--split-dialog-header-bg);
}

.dialog-header h4 {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.dialog-icon {
  font-size: 1.125rem;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #fff;
  box-shadow: 0 8px 18px rgba(79, 70, 229, 0.3);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1, 0.25rem);
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 150ms);
}

.btn-close:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.split-dialog--dark .dialog-header {
  background-color: rgba(17, 24, 39, 0.98) !important;
  background-image: linear-gradient(90deg, rgba(30, 64, 175, 0.2), rgba(49, 46, 129, 0.22)) !important;
  border-bottom-color: rgba(71, 85, 105, 0.68) !important;
}

.split-dialog--dark .dialog-header h4,
.split-dialog--dark .btn-close {
  color: #e2e8f0 !important;
}

.dialog-body {
  flex: 1;
  overflow: hidden;
}

.split-content {
  height: 100%;
  display: flex;
  gap: var(--spacing-3, 0.75rem);
  padding: var(--spacing-3, 0.75rem);
}

.conversation-pane {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--split-pane-border);
  border-radius: 0.95rem;
  overflow: hidden;
  background-color: var(--split-pane-bg);
  box-shadow: var(--split-pane-shadow);
}

.preview-pane {
  position: relative;
  min-width: 0;
  width: 46%;
  border: 1px solid var(--split-pane-border);
  border-radius: 0.95rem;
  overflow: hidden;
  background-color: var(--split-pane-bg);
  display: flex;
  flex-direction: column;
  box-shadow: var(--split-pane-shadow);
}

.messages-container {
  --timeline-panel-width: min(100%, 29.5rem);
  --timeline-tool-call-shell-max-height: min(32rem, calc(100vh - 21rem));
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4, 1rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
  background: var(--split-messages-bg);
}

.message {
  display: flex;
  width: 100%;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.message-content {
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-radius: 1rem;
  font-size: var(--font-size-sm, 13px);
  line-height: 1.6;
  width: fit-content;
  max-width: min(85%, 42rem);
  border: 1px solid transparent;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.05);
}

.message.user .message-content {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  border-bottom-right-radius: 0.38rem;
  box-shadow: 0 12px 20px rgba(79, 70, 229, 0.25);
}

.message.assistant .message-content {
  background: var(--split-assistant-message-bg);
  color: var(--split-assistant-message-text);
  border-bottom-left-radius: 0.38rem;
  border-color: var(--split-assistant-message-border);
}

.message-content p {
  margin: 0;
  white-space: pre-line;
  word-break: break-word;
}

.message-form {
  margin-top: -0.18rem;
}

.form-message-content {
  width: 100%;
  max-width: min(85%, 44rem);
  background: transparent !important;
  border: none !important;
  padding: 0;
  box-shadow: none;
}

.form-message-content.disabled {
  opacity: 0.72;
  pointer-events: none;
}

.message-content.loading {
  display: flex;
  gap: 4px;
  padding: var(--spacing-4, 1rem);
  box-shadow: none;
}

.message-loading-status {
  margin-top: -0.35rem;
  padding: 0 var(--spacing-4, 1rem) var(--spacing-4, 1rem);
  font-size: 0.78rem;
  color: var(--split-loading-text);
}

.message-content.loading .dot {
  width: 8px;
  height: 8px;
  background-color: var(--color-text-tertiary, #94a3b8);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite both;
}

.message-content.loading .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.message-content.loading .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.submitted-values {
  margin-top: var(--spacing-3, 0.75rem);
  padding: var(--spacing-3, 0.75rem);
  background: rgba(255, 255, 255, 0.3);
  border-radius: 0.7rem;
  border: 1px dashed rgba(255, 255, 255, 0.34);
}

.submitted-value-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2, 0.5rem);
  font-size: var(--font-size-sm, 13px);
}

.submitted-value-item .field-label {
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.submitted-value-item .field-value {
  color: white;
  font-weight: var(--font-weight-medium, 500);
}

.message.assistant .submitted-values {
  background: linear-gradient(180deg, #f1f5f9, #e7eef8);
  border: 1px dashed rgba(99, 102, 241, 0.25);
}

.message.assistant .submitted-value-item .field-label {
  color: #64748b;
}

.message.assistant .submitted-value-item .field-value {
  color: #0f172a;
}

.dialog-footer {
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: var(--split-dialog-footer-bg);
  flex-shrink: 0;
}

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3, 0.75rem);
  flex-wrap: wrap;
}

.idle-hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
}

.idle-hint--error {
  color: #dc2626;
}

.footer-actions {
  display: flex;
  gap: var(--spacing-3, 0.75rem);
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.footer-actions--confirm {
  width: 100%;
}

.footer-input-bar {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-2, 0.5rem);
  margin-bottom: var(--spacing-3, 0.75rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.28);
  transition: border-color var(--transition-fast, 150ms), box-shadow var(--transition-fast, 150ms);
}

.footer-input-bar:focus-within {
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
  background: rgba(255, 255, 255, 0.8);
}

.footer-resplit-hint {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  margin-bottom: var(--spacing-2, 0.5rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border-radius: 0.5rem;
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.08), rgba(59, 130, 246, 0.06));
  border: 1px solid rgba(99, 102, 241, 0.15);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.resplit-hint-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(99, 102, 241, 0.2);
  border-top-color: rgba(99, 102, 241, 0.7);
  border-radius: 50%;
  animation: resplit-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes resplit-spin {
  to { transform: rotate(360deg); }
}

.preview-resplit-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3, 0.75rem);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(2px);
  border-radius: inherit;
  pointer-events: none;
}

.resplit-overlay-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(99, 102, 241, 0.15);
  border-top-color: rgba(99, 102, 241, 0.6);
  border-radius: 50%;
  animation: resplit-spin 0.6s linear infinite;
}

.resplit-overlay-text {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
}

.input-wrapper {
  flex: 1;
  min-width: 0;
}

.instruction-input {
  width: 100%;
  min-height: 2rem;
  max-height: 6rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-sm, 13px);
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  overflow-y: auto;
}

.instruction-input::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.instruction-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-input-bar:has(.instruction-input:disabled) {
  opacity: 0.6;
  pointer-events: none;
}

.btn-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast, 150ms);
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.2);
}

.btn-send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(79, 70, 229, 0.3);
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-retry {
  border-color: rgba(14, 165, 233, 0.36);
  color: #0369a1;
  background: linear-gradient(180deg, #ffffff, #eff8ff);
}

.btn-continue {
  border-color: rgba(99, 102, 241, 0.28);
  color: #4338ca;
  background: linear-gradient(180deg, #ffffff, #f3f4ff);
}

.split-log-panel {
  margin-top: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 0.9rem;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92));
  overflow: hidden;
}

.split-log-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  font-size: 0.78rem;
  font-weight: 600;
  color: #1e293b;
}

.split-log-panel__status {
  color: #64748b;
  font-size: 0.72rem;
}

.split-log-panel__body {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.8rem;
}

.split-log-panel__entry {
  padding: 0.7rem 0.8rem;
  border-radius: 0.75rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, rgba(148, 163, 184, 0.18));
}

.split-log-panel__entry-type {
  margin-bottom: 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #6366f1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.split-log-panel__entry--error .split-log-panel__entry-type {
  color: #dc2626;
}

.btn {
  padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
  border-radius: 0.72rem;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-primary {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  border: none;
  box-shadow: 0 9px 18px rgba(79, 70, 229, 0.24);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(79, 70, 229, 0.3);
}

.btn-secondary {
  background: var(--color-surface, #ffffff);
  color: var(--color-text-primary, #334155);
  border: 1px solid var(--color-border, rgba(148, 163, 184, 0.42));
}

.btn-secondary:hover {
  background: linear-gradient(180deg, var(--color-surface, #ffffff), var(--color-bg-secondary, #f5f9ff));
  border-color: rgba(99, 102, 241, 0.35);
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  border: none;
  box-shadow: 0 9px 18px rgba(220, 38, 38, 0.2);
}

.btn-danger:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(220, 38, 38, 0.24);
}

.split-dialog--dark .dialog-footer {
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.98), rgba(15, 23, 42, 0.96)) !important;
  border-top-color: rgba(71, 85, 105, 0.68) !important;
}

.split-dialog--dark .footer-bar {
  background: transparent !important;
}

.split-dialog--dark .idle-hint {
  color: #94a3b8 !important;
}

.split-dialog--dark .idle-hint--error {
  color: #fca5a5 !important;
}

.split-dialog--dark .btn-secondary {
  background: rgba(15, 23, 42, 0.92) !important;
  color: #e2e8f0 !important;
  border-color: rgba(71, 85, 105, 0.76) !important;
}

.split-dialog--dark .btn-secondary:hover {
  background: rgba(30, 41, 59, 0.96) !important;
  border-color: rgba(100, 116, 139, 0.82) !important;
}

.split-dialog--dark .footer-input-bar {
  background: rgba(15, 23, 42, 0.72) !important;
  border-color: rgba(71, 85, 105, 0.6) !important;
}

.split-dialog--dark .footer-input-bar:focus-within {
  border-color: rgba(99, 102, 241, 0.55) !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15) !important;
  background: rgba(15, 23, 42, 0.85) !important;
}

.split-dialog--dark .instruction-input {
  color: #e2e8f0 !important;
}

.split-dialog--dark .instruction-input::placeholder {
  color: #64748b !important;
}

.split-dialog--dark .footer-resplit-hint {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.12), rgba(59, 130, 246, 0.08));
  border-color: rgba(99, 102, 241, 0.2);
  color: #94a3b8;
}

.split-dialog--dark .preview-resplit-overlay {
  background: rgba(15, 23, 42, 0.72);
}

.split-dialog--dark .resplit-overlay-text {
  color: #94a3b8;
}

:global([data-theme='dark']) .split-dialog,
:global(.dark) .split-dialog {
  --split-dialog-bg:
    radial-gradient(circle at 12% 0%, rgba(14, 165, 233, 0.16), transparent 26%),
    radial-gradient(circle at 88% 100%, rgba(99, 102, 241, 0.14), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.96));
  --split-dialog-border: rgba(71, 85, 105, 0.72);
  --split-dialog-shadow: 0 28px 56px rgba(2, 6, 23, 0.48);
  --split-dialog-header-bg-color: rgba(17, 24, 39, 0.98);
  --split-dialog-header-bg: linear-gradient(90deg, rgba(30, 64, 175, 0.2), rgba(49, 46, 129, 0.22));
  --split-dialog-footer-bg: linear-gradient(180deg, rgba(17, 24, 39, 0.98), rgba(15, 23, 42, 0.96));
  --split-pane-bg: rgba(15, 23, 42, 0.86);
  --split-pane-border: rgba(71, 85, 105, 0.76);
  --split-pane-shadow: 0 16px 34px rgba(2, 6, 23, 0.28);
  --split-messages-bg:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 42%),
    linear-gradient(to bottom, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.94) 35%);
  --split-assistant-message-bg: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.92));
  --split-assistant-message-border: rgba(71, 85, 105, 0.62);
  --split-assistant-message-text: #e2e8f0;
  --split-loading-text: #94a3b8;
}

:global([data-theme='dark']) .split-dialog .btn-close:hover,
:global(.dark) .split-dialog .btn-close:hover {
  background-color: rgba(51, 65, 85, 0.72);
  color: #f8fafc;
}

.message.cancelled {
  opacity: 0.65;
}

.message.cancelled .message-content {
  border-style: dashed;
}

.cancelled-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  font-size: 11px;
  color: #ef4444;
}

.cancelled-badge svg {
  opacity: 0.8;
}

@media (max-width: 1024px) {
  .split-content {
    flex-direction: column;
  }

  .preview-pane {
    width: 100%;
    min-height: 16rem;
  }

  .footer-bar {
    align-items: flex-start;
  }

  .footer-actions,
  .footer-actions--confirm {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
