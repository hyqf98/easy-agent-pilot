/** 智能体 CLI 用量统计的 Pinia store，提供汇总查询、筛选条件与修复操作。 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type {
  AgentCliUsageGranularity,
  AgentCliUsageProviderFilter,
  AgentCliUsageSummary,
  RepairAgentCliUsageHistoryResult,
  AgentCliUsageStatsResponse,
  QueryAgentCliUsageStatsInput
} from '@/types/agentCliUsage'

interface AgentCliUsageFilters {
  startDate: string
  endDate: string
  cliType: AgentCliUsageProviderFilter
  modelKeyword: string
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildDefaultFilters(): AgentCliUsageFilters {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 29)

  return {
    startDate: formatDateInput(startDate),
    endDate: formatDateInput(endDate),
    cliType: 'all',
    modelKeyword: ''
  }
}

function toRangeBoundary(date: string, boundary: 'start' | 'end'): string | undefined {
  if (!date) {
    return undefined
  }

  const value = new Date(`${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}`)
  if (Number.isNaN(value.getTime())) {
    return undefined
  }

  return value.toISOString()
}

function createEmptyResponse(filters: AgentCliUsageFilters): AgentCliUsageStatsResponse {
  return {
    summary: {
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedInputCostUsd: 0,
      estimatedOutputCostUsd: 0,
      estimatedTotalCostUsd: 0,
      unpricedCalls: 0
    },
    timeline: [],
    breakdown: [],
    stackedTimeline: [],
    meta: {
      startAt: toRangeBoundary(filters.startDate, 'start'),
      endAt: toRangeBoundary(filters.endDate, 'end'),
      granularity: 'day',
      dimension: 'agent',
      providerFilter: filters.cliType,
      modelKeyword: filters.modelKeyword.trim() || undefined,
      pricingVersion: '',
      costPartial: false
    }
  }
}

function resolveGranularity(startDate: string, endDate: string): AgentCliUsageGranularity {
  const start = new Date(`${startDate}T00:00:00.000`)
  const end = new Date(`${endDate}T23:59:59.999`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'day'
  }

  const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))
  if (diffDays > 730) {
    return 'year'
  }
  if (diffDays > 120) {
    return 'month'
  }

  return 'day'
}

export const useAgentCliUsageStore = defineStore('agentCliUsage', () => {
  const filters = ref<AgentCliUsageFilters>(buildDefaultFilters())
  const stats = ref<AgentCliUsageStatsResponse>(createEmptyResponse(filters.value))
  const modelStats = ref<AgentCliUsageStatsResponse>(createEmptyResponse(filters.value))
  const isLoading = ref(false)
  const errorMessage = ref('')
  const hasLoaded = ref(false)

  const baseQueryInput = computed<Omit<QueryAgentCliUsageStatsInput, 'dimension'>>(() => ({
    startAt: toRangeBoundary(filters.value.startDate, 'start'),
    endAt: toRangeBoundary(filters.value.endDate, 'end'),
    granularity: resolveGranularity(filters.value.startDate, filters.value.endDate),
    providerFilter: filters.value.cliType,
    modelKeyword: filters.value.modelKeyword.trim() || undefined
  }))

  const agentQueryInput = computed<QueryAgentCliUsageStatsInput>(() => ({
    ...baseQueryInput.value,
    dimension: 'agent'
  }))

  const modelQueryInput = computed<QueryAgentCliUsageStatsInput>(() => ({
    ...baseQueryInput.value,
    dimension: 'model'
  }))

  async function loadStats() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      const repairProvider = filters.value.cliType === 'all'
        ? undefined
        : filters.value.cliType

      await invoke<RepairAgentCliUsageHistoryResult>('repair_agent_cli_usage_history', {
        provider: repairProvider
      }).catch((error) => {
        console.warn('[agentCliUsage] Failed to repair historical usage records:', error)
        return null
      })

      const [agentResponse, modelResponse] = await Promise.all([
        invoke<AgentCliUsageStatsResponse>('query_agent_cli_usage_stats', {
          input: agentQueryInput.value
        }),
        invoke<AgentCliUsageStatsResponse>('query_agent_cli_usage_stats', {
          input: modelQueryInput.value
        })
      ])

      stats.value = agentResponse
      modelStats.value = modelResponse
      hasLoaded.value = true
    } catch (error) {
      stats.value = createEmptyResponse(filters.value)
      modelStats.value = createEmptyResponse(filters.value)
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  function resetFilters() {
    filters.value = buildDefaultFilters()
  }

  // 今日用量汇总：从 timeline 中聚合当天 bucket
  const todaySummary = computed<AgentCliUsageSummary>(() => {
    const today = formatDateInput(new Date())
    const empty: AgentCliUsageSummary = {
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedInputCostUsd: 0,
      estimatedOutputCostUsd: 0,
      estimatedTotalCostUsd: 0,
      unpricedCalls: 0
    }

    return stats.value.timeline
      .filter(point => point.bucket.startsWith(today))
      .reduce<AgentCliUsageSummary>((acc, point) => ({
        totalCalls: acc.totalCalls + point.callCount,
        inputTokens: acc.inputTokens + point.inputTokens,
        outputTokens: acc.outputTokens + point.outputTokens,
        totalTokens: acc.totalTokens + point.totalTokens,
        cacheReadTokens: acc.cacheReadTokens + point.cacheReadTokens,
        cacheCreationTokens: acc.cacheCreationTokens + point.cacheCreationTokens,
        estimatedInputCostUsd: acc.estimatedInputCostUsd + point.estimatedInputCostUsd,
        estimatedOutputCostUsd: acc.estimatedOutputCostUsd + point.estimatedOutputCostUsd,
        estimatedTotalCostUsd: acc.estimatedTotalCostUsd + point.estimatedTotalCostUsd,
        unpricedCalls: acc.unpricedCalls
      }), empty)
  })

  return {
    filters,
    stats,
    modelStats,
    todaySummary,
    isLoading,
    errorMessage,
    hasLoaded,
    agentQueryInput,
    modelQueryInput,
    loadStats,
    resetFilters
  }
})
