/** useFileChangeSummaryBar — FileChangeSummaryBar 文件变更摘要条组件的 composable，订阅 fileChange store 并按 toolCallId 过滤变更。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileChangeStore } from '@/stores/fileChange'
import type { FileEditChangeType, FileEditTrace } from '@/types/fileTrace'

export interface FileChangeSummaryBarProps {
  sessionId: string
  requestId: string
  /** 可选：仅展示该工具调用产生的文件变更（嵌入工具气泡时按 toolCallId 精确过滤） */
  toolCallId?: string
}

export function useFileChangeSummaryBar(props: FileChangeSummaryBarProps) {
  const { t } = useI18n()
  const fileChangeStore = useFileChangeStore()

  const traces = computed<FileEditTrace[]>(() => {
    const requestTraces = fileChangeStore.getTracesForRequest(props.sessionId, props.requestId)
    if (!props.toolCallId) {
      return requestTraces
    }
    return requestTraces.filter(trace => trace.toolCallId === props.toolCallId)
  })

  const visible = computed(() => traces.value.length > 0)

  const expanded = computed(() => fileChangeStore.isExpanded(props.requestId))

  const pendingCount = computed(() =>
    traces.value.filter(tr => (tr.status ?? 'pending') === 'pending').length
  )

  const compactSummary = computed(() => {
    const parts = traces.value.slice(0, 3).map(trace => {
      const stats = lineStats(trace)
      const suffix = [
        stats.added > 0 ? `+${stats.added}` : '',
        stats.removed > 0 ? `-${stats.removed}` : ''
      ].filter(Boolean).join(' ')
      return suffix ? `${trace.relativePath} ${suffix}` : trace.relativePath
    })
    const overflow = traces.value.length - parts.length
    return overflow > 0 ? `${parts.join(' / ')} / +${overflow}` : parts.join(' / ')
  })

  function changeTypeMeta(type: FileEditChangeType) {
    switch (type) {
      case 'create': return { dot: 'create', icon: 'file-plus' }
      case 'delete': return { dot: 'delete', icon: 'file-minus' }
      default: return { dot: 'modify', icon: 'file-pen' }
    }
  }

  /** 计算 before/after 行数差，用于显示 +N / -M */
  function lineStats(tr: FileEditTrace): { added: number, removed: number } {
    const before = (tr.beforeContent ?? '').split('\n').filter(l => l !== '').length
    const after = (tr.afterContent ?? '').split('\n').filter(l => l !== '').length
    if (tr.changeType === 'create') return { added: after, removed: 0 }
    if (tr.changeType === 'delete') return { added: 0, removed: before }
    const delta = after - before
    return delta >= 0 ? { added: delta, removed: 0 } : { added: 0, removed: -delta }
  }

  function toggleExpand() {
    fileChangeStore.toggleExpand(props.requestId)
  }

  function reviewAll() {
    if (traces.value.length === 0) return
    fileChangeStore.openReview(props.sessionId, props.requestId)
  }

  function reviewOne(tr: FileEditTrace) {
    if ((tr.status ?? 'pending') !== 'pending') return
    fileChangeStore.openReview(props.sessionId, props.requestId, tr.id)
  }

  return {
    t,
    traces,
    visible,
    expanded,
    pendingCount,
    compactSummary,
    changeTypeMeta,
    lineStats,
    toggleExpand,
    reviewAll,
    reviewOne
  }
}
