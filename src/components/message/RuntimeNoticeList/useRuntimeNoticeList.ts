/** useRuntimeNoticeList — RuntimeNoticeList 运行时通知列表组件的 composable，将通知与用量摘要归并展示。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuntimeNotice } from '@/utils/runtimeNotice'
import { getUsageNoticeSummary, summarizeRuntimeNotice } from '@/utils/runtimeNotice'
import { resolveRecordedModelId } from '@/services/usage/agentCliUsageRecorder'

interface UsageFallback {
  model?: string
  inputTokens?: number
  outputTokens?: number
  contextWindowOccupancy?: number
}

export interface RuntimeNoticeListProps {
  notices: RuntimeNotice[]
  defaultExpanded?: boolean
  fallbackUsage?: UsageFallback | null
  compactContextSummary?: boolean
}

export function useRuntimeNoticeList(props: RuntimeNoticeListProps) {
  const { t } = useI18n()

  const expandedIds = ref<Set<string>>(new Set(
    props.defaultExpanded ? props.notices.map(notice => notice.id) : []
  ))

  const usageNotices = computed(() => props.notices.filter(isUsageNotice))
  const regularNotices = computed(() => props.notices.filter(notice => !isUsageNotice(notice)))
  const primaryRegularNotice = computed(() => regularNotices.value[0] ?? null)
  const extraRegularNotices = computed(() => regularNotices.value.slice(1))
  const primaryUsageNotice = computed(() => usageNotices.value[0] ?? null)
  const extraUsageNotices = computed(() => usageNotices.value.slice(1))
  const shouldUseCombinedSummary = computed(() => Boolean(primaryRegularNotice.value && primaryUsageNotice.value))
  const requestedModelFallback = computed(() => {
    const fromRegularNotice = regularNotices.value
      .map(notice => extractModelFromNotice(notice))
      .find(Boolean)

    return fromRegularNotice || props.fallbackUsage?.model?.trim() || null
  })

  function toggleNotice(id: string) {
    const next = new Set(expandedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    expandedIds.value = next
  }

  function isExpanded(id: string) {
    return expandedIds.value.has(id)
  }

  function isUsageNotice(notice: RuntimeNotice) {
    return notice.id === 'usage' || (notice.title ?? '').toLowerCase().includes('model')
  }

  function isEnvironmentNotice(notice: RuntimeNotice) {
    return notice.id === 'environment'
  }

  function isCompactContextNotice(notice: RuntimeNotice) {
    return props.compactContextSummary && notice.id === 'context'
  }

  function noticeChips(notice: RuntimeNotice) {
    return summarizeRuntimeNotice(notice).map(chip => formatChipLabel(notice, chip))
  }

  function extractNoticeFieldValue(notice: RuntimeNotice, labels: string[]) {
    const lines = notice.content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      const normalizedLine = line.replace(/^-\s*/, '')
      const separatorIndex = normalizedLine.indexOf(':')
      if (separatorIndex < 0) {
        continue
      }

      const label = normalizedLine.slice(0, separatorIndex).trim().toLowerCase()
      const value = normalizedLine.slice(separatorIndex + 1).trim()
      if (!value) {
        continue
      }

      if (labels.includes(label)) {
        return value
      }
    }

    return null
  }

  function compactContextNoticeChips(notice: RuntimeNotice) {
    const chips = [
      extractNoticeFieldValue(notice, ['模型', 'model']),
      extractNoticeFieldValue(notice, ['专家', 'expert'])
    ].filter((value): value is string => Boolean(value))

    return chips.length > 0 ? chips : noticeChips(notice).slice(0, 2)
  }

  function usageSummary(notice: RuntimeNotice) {
    const summary = getUsageNoticeSummary(notice)
    const fallback = props.fallbackUsage
    const requestedModel = requestedModelFallback.value
    const hasUsageValue = (value: unknown) => value !== null && value !== undefined && value !== ''
    const noticeContextOccupancy = extractUsageNoticeContextOccupancy(notice)

    if (!summary) {
      if (!fallback) {
        return null
      }

      const hasFallbackInput = typeof fallback.inputTokens === 'number'
      const hasFallbackOutput = typeof fallback.outputTokens === 'number'

      return {
        model: resolveRecordedModelId({
          reportedModelId: fallback.model,
          requestedModelId: requestedModel
        }) || requestedModel || fallback.model || null,
        input: hasFallbackInput ? String(fallback.inputTokens) : null,
        output: hasFallbackOutput ? String(fallback.outputTokens) : null
      }
    }

    const hasRealInput = hasUsageValue(summary.input)
    const hasRealOutput = hasUsageValue(summary.output)
    const fallbackInput = typeof fallback?.inputTokens === 'number' ? String(fallback.inputTokens) : null
    const fallbackOutput = typeof fallback?.outputTokens === 'number' ? String(fallback.outputTokens) : null
    const shouldPreferFallbackInput = Boolean(
      fallbackInput
      && fallback?.contextWindowOccupancy
      && noticeContextOccupancy
      && toUsageNumber(summary.input) === fallback.contextWindowOccupancy
      && fallback.inputTokens !== fallback.contextWindowOccupancy
    )

    return {
      model: resolveRecordedModelId({
        reportedModelId: summary.model || fallback?.model,
        requestedModelId: requestedModel
      }) || requestedModel || summary.model || fallback?.model || null,
      input: shouldPreferFallbackInput
        ? fallbackInput
        : (hasRealInput ? summary.input : (fallbackInput || null)),
      output: hasRealOutput ? summary.output : (fallbackOutput || null)
    }
  }

  function extractModelFromNotice(notice: RuntimeNotice): string | null {
    const match = notice.content.match(/(?:^|\n)-?\s*(?:模型|model)\s*:\s*(.+)$/im)
    return match?.[1]?.trim() || null
  }

  function toUsageNumber(value: string | null | undefined): number | null {
    if (!value) {
      return null
    }

    const numeric = Number(value.replace(/[^\d]/g, ''))
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null
  }

  function extractUsageNoticeContextOccupancy(notice: RuntimeNotice): number | null {
    const match = notice.content.match(/(?:^|\n)-?\s*(?:上下文占用|context occupancy|context window occupancy)\s*:\s*(.+)$/im)
    return toUsageNumber(match?.[1] ?? null)
  }

  function usageModelLabel(notice: RuntimeNotice) {
    return usageSummary(notice)?.model || requestedModelFallback.value || '—'
  }

  function formatChipLabel(notice: RuntimeNotice, chip: string) {
    if (!isEnvironmentNotice(notice)) {
      return chip
    }

    return chip
      .replace(/^Skills\s+/i, 'Sk ')
      .replace(/^Plugins\s+/i, 'Pl ')
      .replace(/^Agents\s+/i, 'Ag ')
      .replace(/^Commands\s+/i, 'Cmd ')
  }

  return {
    t,
    shouldUseCombinedSummary,
    primaryRegularNotice,
    primaryUsageNotice,
    extraRegularNotices,
    extraUsageNotices,
    noticeChips,
    isExpanded,
    toggleNotice,
    usageModelLabel,
    usageSummary,
    isUsageNotice,
    isCompactContextNotice,
    compactContextNoticeChips
  }
}
