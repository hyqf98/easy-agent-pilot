import type { Composer } from 'vue-i18n'
import type * as echarts from 'echarts'

type Translate = Composer['t']

interface TimelineRow {
  label: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedTotalCostUsd: number
}

interface ProviderBreakdownRow {
  provider: string
  label: string
  callCount: number
  totalTokens: number
  estimatedTotalCostUsd: number
}

interface RankingRow {
  label: string
  callCount: number
  totalTokens: number
  estimatedTotalCostUsd: number
}

interface ModelRankingRow extends RankingRow {
  inputTokens: number
  outputTokens: number
}

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

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

export function getProviderColor(provider: string): string {
  switch (provider) {
    case 'claude':
      return '#0f766e'
    case 'codex':
      return '#ea580c'
    default:
      return '#64748b'
  }
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

export function applyProviderChart(options: {
  chart: echarts.ECharts | null
  rows: ProviderBreakdownRow[]
  t: Translate
}) {
  const { chart, rows, t } = options
  if (!chart) {
    return
  }

  chart.setOption({
    animation: false,
    color: rows.map(item => getProviderColor(item.provider)),
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        data?: ProviderBreakdownRow
      }) => {
        const item = params.data
        if (!item) {
          return ''
        }

        return [
          item.label,
          `${t('settings.usageStats.summaryCalls')}：${formatInteger(item.callCount)}`,
          `${t('settings.usageStats.summaryTotalTokens')}：${formatInteger(item.totalTokens)}`,
          `${t('settings.usageStats.summaryEstimatedCost')}：${formatCurrency(item.estimatedTotalCostUsd)}`
        ].join('<br />')
      }
    },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10
    },
    series: [
      {
        name: t('settings.usageStats.providerShareTitle'),
        type: 'pie',
        radius: ['52%', '76%'],
        center: ['50%', '44%'],
        itemStyle: {
          borderRadius: 12,
          borderColor: '#fff',
          borderWidth: 4
        },
        label: {
          show: true,
          formatter: ({ data }: { data?: ProviderBreakdownRow }) => (
            data ? `${data.label}\n${formatCurrency(data.estimatedTotalCostUsd)}` : ''
          )
        },
        data: rows.map(item => ({
          name: item.label,
          value: item.estimatedTotalCostUsd > 0 ? item.estimatedTotalCostUsd : item.totalTokens,
          ...item
        }))
      }
    ]
  })
}

export function applyAgentChart(options: {
  chart: echarts.ECharts | null
  rows: RankingRow[]
  chartWidth: number
  t: Translate
}) {
  const { chart, rows, chartWidth, t } = options
  if (!chart) {
    return
  }

  const reversedRows = [...rows].reverse()
  const axisLabelWidth = chartWidth > 0
    ? Math.max(112, Math.min(168, Math.floor(chartWidth * 0.24)))
    : 168
  const compact = chartWidth > 0 && chartWidth < 760

  chart.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = reversedRows[params[0]?.dataIndex ?? 0]
        if (!row) {
          return ''
        }

        return [
          row.label,
          `${t('settings.usageStats.summaryCalls')}：${formatInteger(row.callCount)}`,
          `${t('settings.usageStats.summaryTotalTokens')}：${formatInteger(row.totalTokens)}`,
          `${t('settings.usageStats.summaryEstimatedCost')}：${formatCurrency(row.estimatedTotalCostUsd)}`
        ].join('<br />')
      }
    },
    grid: {
      left: 8,
      right: compact ? 16 : 24,
      top: 16,
      bottom: compact ? 58 : 68,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: t('settings.usageStats.summaryTotalTokens'),
      nameLocation: 'middle',
      nameGap: compact ? 34 : 42,
      axisLabel: {
        hideOverlap: true,
        margin: 12
      },
      nameTextStyle: {
        padding: [12, 0, 0, 0]
      }
    },
    yAxis: {
      type: 'category',
      data: reversedRows.map(item => item.label),
      axisLabel: {
        width: axisLabelWidth,
        overflow: 'truncate'
      }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        data: reversedRows.map(item => item.totalTokens),
        itemStyle: { color: '#2563eb' }
      }
    ]
  })
}

export function applyModelChart(options: {
  chart: echarts.ECharts | null
  rows: ModelRankingRow[]
  chartWidth: number
  t: Translate
}) {
  const { chart, rows, chartWidth, t } = options
  if (!chart) {
    return
  }

  const reversedRows = [...rows].reverse()
  const axisLabelWidth = chartWidth > 0
    ? Math.max(120, Math.min(184, Math.floor(chartWidth * 0.26)))
    : 184
  const compact = chartWidth > 0 && chartWidth < 760

  chart.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = reversedRows[params[0]?.dataIndex ?? 0]
        if (!row) {
          return ''
        }

        return [
          row.label,
          `${t('settings.usageStats.summaryCalls')}：${formatInteger(row.callCount)}`,
          `${t('settings.usageStats.summaryInputTokens')}：${formatInteger(row.inputTokens)}`,
          `${t('settings.usageStats.summaryOutputTokens')}：${formatInteger(row.outputTokens)}`,
          `${t('settings.usageStats.summaryEstimatedCost')}：${formatCurrency(row.estimatedTotalCostUsd)}`
        ].join('<br />')
      }
    },
    grid: {
      left: 8,
      right: compact ? 16 : 24,
      top: 16,
      bottom: compact ? 60 : 72,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: t('settings.usageStats.summaryEstimatedCost'),
      nameLocation: 'middle',
      nameGap: compact ? 36 : 44,
      axisLabel: {
        formatter: (value: number) => formatCurrency(value),
        hideOverlap: true,
        margin: 12
      },
      nameTextStyle: {
        padding: [12, 0, 0, 0]
      }
    },
    yAxis: {
      type: 'category',
      data: reversedRows.map(item => item.label),
      axisLabel: {
        width: axisLabelWidth,
        overflow: 'truncate'
      }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        data: reversedRows.map(item => Number(item.estimatedTotalCostUsd.toFixed(6))),
        itemStyle: { color: '#ea580c' }
      }
    ]
  })
}
