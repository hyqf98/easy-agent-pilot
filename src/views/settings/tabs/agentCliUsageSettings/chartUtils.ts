/** Agent CLI 用量设置中的 ECharts 图表构建工具：将用量数据组装为趋势/堆叠图的 option 与格式化函数。 */
import type { Composer } from 'vue-i18n'
import type * as echarts from 'echarts'
import type { AgentCliUsageStackedPoint } from '@/types/agentCliUsage'

type Translate = Composer['t']

interface TimelineRow {
  label: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedTotalCostUsd: number
}

export type UsageMetric = 'tokens' | 'cost'

export function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value)
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`
}

export function applyTrendChart(options: {
  chart: echarts.ECharts | null
  timeline: TimelineRow[]
  t: Translate
}) {
  const { chart, timeline, t } = options
  if (!chart) {
    return
  }

  const cacheHitRateData = timeline.map(item => {
    const totalInput = item.inputTokens + item.cacheReadTokens + item.cacheCreationTokens
    return totalInput > 0
      ? Number((item.cacheReadTokens / totalInput).toFixed(4))
      : 0
  })

  chart.setOption({
    animation: false,
    color: ['#2563eb', '#0f766e', '#ea580c', '#8b5cf6'],
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      data: [
        t('settings.usageStats.summaryInputTokens'),
        t('settings.usageStats.summaryOutputTokens'),
        t('settings.usageStats.summaryEstimatedCost'),
        t('settings.usageStats.cacheHitRate')
      ]
    },
    grid: { left: 48, right: 96, top: 48, bottom: 28 },
    xAxis: {
      type: 'category',
      data: timeline.map(item => item.label)
    },
    yAxis: [
      {
        type: 'value',
        name: t('settings.usageStats.summaryTotalTokens')
      },
      {
        type: 'value',
        name: 'USD',
        position: 'right',
        axisLabel: {
          formatter: (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`
        }
      },
      {
        type: 'value',
        name: '%',
        position: 'right',
        min: 0,
        max: 1,
        show: false
      }
    ],
    series: [
      {
        name: t('settings.usageStats.summaryInputTokens'),
        type: 'bar',
        stack: 'tokens',
        barMaxWidth: 24,
        data: timeline.map(item => item.inputTokens)
      },
      {
        name: t('settings.usageStats.summaryOutputTokens'),
        type: 'bar',
        stack: 'tokens',
        barMaxWidth: 24,
        data: timeline.map(item => item.outputTokens)
      },
      {
        name: t('settings.usageStats.summaryEstimatedCost'),
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: timeline.map(item => Number(item.estimatedTotalCostUsd.toFixed(6)))
      },
      {
        name: t('settings.usageStats.cacheHitRate'),
        type: 'line',
        smooth: true,
        yAxisIndex: 2,
        symbol: 'circle',
        symbolSize: 6,
        data: cacheHitRateData
      }
    ]
  })
}

// 用于多模型折线图的配色板
const MODEL_LINE_COLORS = [
  '#2563eb', '#0f766e', '#ea580c', '#8b5cf6',
  '#dc2626', '#0891b2', '#ca8a04', '#db2777'
]

/**
 * 每模型折线图：按时间桶展示各模型的 Token 用量或费用趋势。
 *
 * 数据取自 model 维度的 stackedTimeline（模型 × 时间桶）。
 */
export function applyModelTrendChart(options: {
  chart: echarts.ECharts | null
  stackedTimeline: AgentCliUsageStackedPoint[]
  metric: UsageMetric
  t: Translate
}) {
  const { chart, stackedTimeline, metric, t } = options
  if (!chart) {
    return
  }

  // 收集有序的时间桶与模型
  const buckets: { key: string; label: string }[] = []
  const bucketIndex = new Map<string, number>()
  for (const point of stackedTimeline) {
    if (!bucketIndex.has(point.bucket)) {
      bucketIndex.set(point.bucket, buckets.length)
      buckets.push({ key: point.bucket, label: point.label })
    }
  }

  const modelOrder: string[] = []
  const modelLabel = new Map<string, string>()
  for (const point of stackedTimeline) {
    if (!modelLabel.has(point.dimensionId)) {
      modelLabel.set(point.dimensionId, point.dimensionLabel || point.dimensionId)
      modelOrder.push(point.dimensionId)
    }
  }

  // 点位查询表：dimensionId -> bucket -> 数值
  const lookup = new Map<string, Map<string, AgentCliUsageStackedPoint>>()
  for (const point of stackedTimeline) {
    let byBucket = lookup.get(point.dimensionId)
    if (!byBucket) {
      byBucket = new Map()
      lookup.set(point.dimensionId, byBucket)
    }
    byBucket.set(point.bucket, point)
  }

  const isCost = metric === 'cost'
  const series = modelOrder.map((modelId, index) => ({
    name: modelLabel.get(modelId) ?? modelId,
    type: 'line' as const,
    smooth: true,
    showSymbol: false,
    data: buckets.map(bucket => {
      const point = lookup.get(modelId)?.get(bucket.key)
      if (!point) return 0
      return isCost
        ? Number(point.estimatedTotalCostUsd.toFixed(6))
        : point.totalTokens
    }),
    itemStyle: { color: MODEL_LINE_COLORS[index % MODEL_LINE_COLORS.length] },
    lineStyle: { color: MODEL_LINE_COLORS[index % MODEL_LINE_COLORS.length] }
  }))

  chart.setOption({
    animation: false,
    color: MODEL_LINE_COLORS,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, type: 'scroll' },
    grid: { left: 56, right: 24, top: 48, bottom: 28 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: buckets.map(item => item.label)
    },
    yAxis: {
      type: 'value',
      name: isCost
        ? t('settings.usageStats.summaryEstimatedCost')
        : t('settings.usageStats.summaryTotalTokens'),
      axisLabel: {
        formatter: (value: number) => isCost ? formatCurrency(value) : formatInteger(value)
      }
    },
    series
  }, { replaceMerge: ['series'] })
}
