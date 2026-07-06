/** useExecutionTimeline — ExecutionTimeline 执行时间线组件的 composable，聚合工具调用/思考/表单提交为时间线条目。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'
import type { TimelineEntry } from '@/types/timeline'
import { resolveRecordedModelId } from '@/services/usage/agentCliUsageRecorder'
import { buildRuntimeNoticeFromSystemContent } from '@/utils/runtimeNotice'
import type { ToolCall } from '@/stores/message'
import type { DynamicFormSchema } from '@/types/plan'

function buildSubmittedFormSummary(schema?: DynamicFormSchema, values?: Record<string, unknown>): string {
  if (!schema || !values) return ''
  return schema.fields
    .map(field => {
      const raw = values[field.name]
      const matched = field.options?.find(opt => opt.value === raw)
      const display = matched ? matched.label : String(raw ?? '')
      return `${field.label}: ${display}`
    })
    .join('\n')
}

export interface ExecutionTimelineProps {
  entries: TimelineEntry[]
  groupToolCalls?: boolean
  showElapsedMeta?: boolean
  formCancelText?: string
  compactContextNotices?: boolean
}

export interface ExecutionTimelineEmits {
  (event: 'form-submit', entryId: string, values: Record<string, unknown>): void
  (event: 'form-cancel', entryId: string): void
  (event: 'message-form-submit', formId: string, values: Record<string, unknown>): void
  (event: 'message-form-cancel', formId: string): void
}

export function useExecutionTimeline(props: ExecutionTimelineProps, emit: ExecutionTimelineEmits) {
  const { t } = useI18n()
  const themeStore = useThemeStore()
  const isDarkTheme = computed(() => themeStore.isDark)

  function handleMessageFormSubmit(formId: string, values: Record<string, unknown>) {
    emit('message-form-submit', formId, values)
  }

  function handleMessageFormCancel(formId: string) {
    emit('message-form-cancel', formId)
  }

  function toRuntimeNotices(content?: string) {
    const notice = buildRuntimeNoticeFromSystemContent(content)
    return notice ? [notice] : []
  }

  function getToolCallRenderKey(toolCall: ToolCall) {
    const argumentsSignature = JSON.stringify(toolCall.arguments ?? {})
    return [
      toolCall.id,
      toolCall.status,
      argumentsSignature,
      toolCall.result?.length ?? 0,
      toolCall.errorMessage?.length ?? 0
    ].join(':')
  }

  interface TimelineRenderBlockEntry {
    kind: 'entry'
    key: string
    entry: TimelineEntry
  }

  interface TimelineRenderBlockToolGroup {
    kind: 'tool-group'
    key: string
    entries: TimelineEntry[]
  }

  interface TimelineRenderBlockAssistantTurn {
    kind: 'assistant-turn'
    key: string
    thinkingEntry: TimelineEntry | null
    toolEntries: TimelineEntry[]
    contentEntry: TimelineEntry | null
  }

  type TimelineRenderBlock =
    | TimelineRenderBlockEntry
    | TimelineRenderBlockToolGroup
    | TimelineRenderBlockAssistantTurn

  function getToolGroupKey(entries: TimelineEntry[]) {
    const firstId = entries[0]?.id ?? 'start'
    const lastId = entries[entries.length - 1]?.id ?? 'end'
    return `tool-group:${firstId}:${lastId}:${entries.length}`
  }

  function shouldClampToolGroup(entries: TimelineEntry[]) {
    return entries.length > 10
  }

  function resolveTimelineEntriesModel(entries: Array<TimelineEntry | null | undefined>) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const model = entries[index]?.runtimeFallbackUsage?.model?.trim()
      if (model) {
        return model
      }
    }

    return ''
  }

  function resolveToolGroupModelLabel(
    toolEntries: TimelineEntry[],
    fallbackEntries: Array<TimelineEntry | null | undefined> = []
  ) {
    const reportedModel = resolveTimelineEntriesModel(toolEntries)
    const requestedModel = resolveTimelineEntriesModel(fallbackEntries)
    return resolveRecordedModelId({
      reportedModelId: reportedModel,
      requestedModelId: requestedModel
    }) || requestedModel || reportedModel || ''
  }

  function isAssistantContentEntry(entry: TimelineEntry) {
    return entry.type === 'content'
      || (entry.type === 'message' && entry.role !== 'user')
  }

  function buildMergedAssistantContentEntry(entries: TimelineEntry[]): TimelineEntry | null {
    const contentEntries = entries.filter(isAssistantContentEntry)
    if (contentEntries.length === 0) {
      return null
    }

    const lastEntry = contentEntries[contentEntries.length - 1]
    return {
      ...lastEntry,
      type: 'content',
      role: 'assistant',
      content: contentEntries
        .map(entry => entry.content || '')
        .join(''),
      animate: contentEntries.some(entry => entry.animate)
    }
  }

  function buildMergedThinkingEntry(entries: TimelineEntry[]): TimelineEntry | null {
    const thinkingEntries = entries.filter(entry => entry.type === 'thinking')
    if (thinkingEntries.length === 0) {
      return null
    }

    const lastEntry = thinkingEntries[thinkingEntries.length - 1]
    return {
      ...lastEntry,
      type: 'thinking',
      content: thinkingEntries
        .map(entry => entry.content || '')
        .filter(Boolean)
        .join('\n\n'),
      animate: thinkingEntries.some(entry => entry.animate)
    }
  }

  function getAssistantTurnKey(entries: TimelineEntry[]) {
    const firstId = entries[0]?.id ?? 'start'
    return `assistant-turn:${firstId}`
  }

  function toTimestampMs(value?: string) {
    if (!value) {
      return null
    }

    const timestamp = new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }

  function formatElapsedMs(value: number | null) {
    if (value === null || value < 250) {
      return null
    }

    if (value < 1_000) {
      return `${Math.round(value)}ms`
    }

    if (value < 60_000) {
      return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}s`
    }

    const minutes = Math.floor(value / 60_000)
    const seconds = Math.round((value % 60_000) / 1_000)
    return `${minutes}m ${seconds}s`
  }

  const collapsedToolGroups = ref<Record<string, boolean>>({})

  function sortToolEntries(entries: TimelineEntry[]) {
    const statusWeight = (entry: TimelineEntry) => {
      const status = entry.toolCall?.status
      switch (status) {
        case 'running':
          return 0
        case 'pending':
          return 1
        case 'error':
          return 2
        default:
          return 3
      }
    }

    return [...entries].sort((left, right) => {
      const weightDiff = statusWeight(left) - statusWeight(right)
      if (weightDiff !== 0) {
        return weightDiff
      }

      const leftTime = new Date(left.timestamp || 0).getTime()
      const rightTime = new Date(right.timestamp || 0).getTime()
      if (leftTime !== rightTime) {
        return leftTime - rightTime
      }

      return left.id.localeCompare(right.id)
    })
  }

  function isToolGroupExpanded(key: string) {
    if (!(key in collapsedToolGroups.value)) {
      collapsedToolGroups.value[key] = false
    }

    return collapsedToolGroups.value[key]
  }

  function toggleToolGroup(key: string) {
    collapsedToolGroups.value[key] = !isToolGroupExpanded(key)
  }

  const renderBlocks = computed<TimelineRenderBlock[]>(() => {
    if (!props.groupToolCalls) {
      return props.entries.map(entry => ({
        kind: 'entry',
        key: entry.id,
        entry
      }))
    }

    const blocks: TimelineRenderBlock[] = []
    let pendingAssistantEntries: TimelineEntry[] = []

    const flushPendingAssistantTurn = () => {
      if (pendingAssistantEntries.length === 0) {
        return
      }

      const thinkingEntry = buildMergedThinkingEntry(pendingAssistantEntries)
      const toolEntries = sortToolEntries(
        pendingAssistantEntries.filter(entry => entry.type === 'tool' && entry.toolCall)
      )
      const contentEntry = buildMergedAssistantContentEntry(pendingAssistantEntries)

      blocks.push({
        kind: 'assistant-turn',
        key: getAssistantTurnKey(pendingAssistantEntries),
        thinkingEntry,
        toolEntries,
        contentEntry
      })
      pendingAssistantEntries = []
    }

    for (const entry of props.entries) {
      if (
        entry.type === 'thinking'
        || (entry.type === 'tool' && entry.toolCall)
        || isAssistantContentEntry(entry)
      ) {
        pendingAssistantEntries.push(entry)
        continue
      }

      flushPendingAssistantTurn()
      blocks.push({
        kind: 'entry',
        key: entry.id,
        entry
      })
    }

    flushPendingAssistantTurn()
    return blocks
  })

  const entryElapsedLabelMap = computed(() => {
    const labels = new Map<string, string>()
    let previousTimestampMs: number | null = null

    for (const entry of props.entries) {
      const timestampMs = toTimestampMs(entry.timestamp)
      const elapsedLabel = timestampMs !== null && previousTimestampMs !== null
        ? formatElapsedMs(Math.max(0, timestampMs - previousTimestampMs))
        : null

      if (elapsedLabel) {
        labels.set(entry.id, elapsedLabel)
      }

      if (timestampMs !== null) {
        previousTimestampMs = timestampMs
      }
    }

    return labels
  })

  function getEntryElapsedLabel(entry: TimelineEntry) {
    if (entry.metaLabel?.trim()) {
      return entry.metaLabel.trim()
    }

    if (!props.showElapsedMeta || entry.role === 'user') {
      return null
    }

    return entryElapsedLabelMap.value.get(entry.id) ?? null
  }

  return {
    t,
    isDarkTheme,
    renderBlocks,
    resolveToolGroupModelLabel,
    shouldClampToolGroup,
    getToolGroupKey,
    isToolGroupExpanded,
    toggleToolGroup,
    getToolCallRenderKey,
    toRuntimeNotices,
    getEntryElapsedLabel,
    buildSubmittedFormSummary,
    handleMessageFormSubmit,
    handleMessageFormCancel
  }
}
