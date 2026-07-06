import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useI18n } from 'vue-i18n'
import type { SelectOption } from '@/components/common'
import { useAgentCliUsageStore } from '@/stores/agentCliUsage'
import {
  applyModelTrendChart,
  applyTrendChart,
  formatCurrency,
  formatInteger,
  formatPercentage,
  type UsageMetric
} from './chartUtils'

/**
 * Agent CLI 用量页面逻辑。
 * 负责筛选条件、今日统计卡片、ECharts 生命周期以及图表重绘。
 */
export function useAgentCliUsageSettings() {
  const { t } = useI18n()
  const usageStore = useAgentCliUsageStore()

  const trendChartRef = ref<HTMLDivElement | null>(null)
  const modelTrendChartRef = ref<HTMLDivElement | null>(null)

  let trendChart: echarts.ECharts | null = null
  let modelTrendChart: echarts.ECharts | null = null
  let resizeObserver: ResizeObserver | null = null

  // 每模型折线图指标切换：Token 用量 / 费用
  const usageMetric = ref<UsageMetric>('tokens')

  const usageMetricOptions = computed<SelectOption[]>(() => [
    { value: 'tokens', label: t('settings.usageStats.metricTokens') },
    { value: 'cost', label: t('settings.usageStats.metricCost') }
  ])

  const cliTypeOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: t('settings.usageStats.providerAll') },
    { value: 'claude', label: 'Claude CLI' },
    { value: 'codex', label: 'Codex CLI' },
    { value: 'opencode', label: 'OpenCode CLI' }
  ])

  const dateRangePresets = computed(() => [
    { key: 'today', label: t('settings.usageStats.presetToday'), days: 0 as const },
    { key: 'last7', label: t('settings.usageStats.presetLast7Days'), days: 6 },
    { key: 'last30', label: t('settings.usageStats.presetLast30Days'), days: 29 },
    { key: 'last90', label: t('settings.usageStats.presetLast90Days'), days: 89 }
  ])

  // 今日统计卡片：总 Token（输入+输出）、折合价格、缓存命中率
  // details 用于 hover 明细弹框（输入/输出 token、输入/输出费用）
  const todayCards = computed(() => {
    const summary = usageStore.todaySummary
    const totalInput = summary.inputTokens + summary.cacheReadTokens + summary.cacheCreationTokens
    const cacheHitRate = totalInput > 0 ? summary.cacheReadTokens / totalInput : 0

    return [
      {
        key: 'today-total-tokens',
        label: t('settings.usageStats.todayTotalTokens'),
        value: formatInteger(summary.totalTokens),
        details: [
          { label: t('settings.usageStats.summaryInputTokens'), value: formatInteger(summary.inputTokens) },
          { label: t('settings.usageStats.summaryOutputTokens'), value: formatInteger(summary.outputTokens) }
        ]
      },
      {
        key: 'today-cost',
        label: t('settings.usageStats.todayCost'),
        value: formatCurrency(summary.estimatedTotalCostUsd),
        details: [
          { label: t('settings.usageStats.todayInputCost'), value: formatCurrency(summary.estimatedInputCostUsd) },
          { label: t('settings.usageStats.todayOutputCost'), value: formatCurrency(summary.estimatedOutputCostUsd) }
        ]
      },
      {
        key: 'today-cache-hit',
        label: t('settings.usageStats.todayCacheHitRate'),
        value: formatPercentage(totalInput > 0 ? cacheHitRate : 0)
      }
    ]
  })

  const hasStats = computed(() => (
    usageStore.stats.timeline.length > 0
    || usageStore.stats.breakdown.length > 0
    || usageStore.modelStats.breakdown.length > 0
  ))

  function applyDatePreset(days: number) {
    const endDate = new Date()
    const startDate = new Date(endDate)

    if (days > 0) {
      startDate.setDate(endDate.getDate() - days)
    }

    usageStore.filters.startDate = startDate.toISOString().slice(0, 10)
    usageStore.filters.endDate = endDate.toISOString().slice(0, 10)
    void refreshStats()
  }

  function initCharts() {
    if (trendChartRef.value && !trendChart) {
      trendChart = echarts.init(trendChartRef.value)
    }
    if (modelTrendChartRef.value && !modelTrendChart) {
      modelTrendChart = echarts.init(modelTrendChartRef.value)
    }
  }

  function disposeCharts() {
    trendChart?.dispose()
    modelTrendChart?.dispose()
    trendChart = null
    modelTrendChart = null
  }

  function resizeCharts() {
    trendChart?.resize()
    modelTrendChart?.resize()
  }

  function applyCharts() {
    applyTrendChart({
      chart: trendChart,
      timeline: usageStore.stats.timeline,
      t
    })
    applyModelTrendChart({
      chart: modelTrendChart,
      stackedTimeline: usageStore.modelStats.stackedTimeline,
      metric: usageMetric.value,
      t
    })
  }

  async function refreshStats() {
    await usageStore.loadStats()
    await nextTick()
    initCharts()
    applyCharts()
    resizeCharts()
  }

  function resetFilters() {
    usageStore.resetFilters()
    void refreshStats()
  }

  watch(
    () => [usageStore.stats, usageStore.modelStats] as const,
    () => {
      applyCharts()
    },
    { deep: true }
  )

  // 指标切换时仅重绘每模型折线图
  watch(usageMetric, () => {
    applyModelTrendChart({
      chart: modelTrendChart,
      stackedTimeline: usageStore.modelStats.stackedTimeline,
      metric: usageMetric.value,
      t
    })
  })

  onMounted(async () => {
    await nextTick()
    initCharts()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resizeCharts())
      if (trendChartRef.value) resizeObserver.observe(trendChartRef.value)
      if (modelTrendChartRef.value) resizeObserver.observe(modelTrendChartRef.value)
    } else {
      window.addEventListener('resize', resizeCharts)
    }

    await refreshStats()
  })

  onBeforeUnmount(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    } else {
      window.removeEventListener('resize', resizeCharts)
    }

    disposeCharts()
  })

  return {
    t,
    usageStore,
    trendChartRef,
    modelTrendChartRef,
    cliTypeOptions,
    dateRangePresets,
    usageMetric,
    usageMetricOptions,
    todayCards,
    hasStats,
    applyDatePreset,
    refreshStats,
    resetFilters
  }
}
