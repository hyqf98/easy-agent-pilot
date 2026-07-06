/** 文件变更评审工作区视图状态：聚合变更轨迹、差异导航与接受/回滚操作。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import MonacoDiffEditor from '../monacoDiffEditor/MonacoDiffEditor.vue'
import { useFileChangeStore } from '@/stores/fileChange'
import type { FileEditTrace } from '@/types/fileTrace'

export interface FileChangeReviewWorkspaceProps {
  sessionId?: string
  requestId?: string
  compact?: boolean
}

export function useFileChangeReviewWorkspace(props: Readonly<FileChangeReviewWorkspaceProps>) {
  const { t } = useI18n()
  const fileChangeStore = useFileChangeStore()
  const selectedIndex = ref(0)

  const traces = computed<FileEditTrace[]>(() =>
    fileChangeStore.getTracesForRequest(props.sessionId ?? '', props.requestId ?? '')
  )
  const selectedTrace = computed<FileEditTrace | null>(() => traces.value[selectedIndex.value] ?? null)
  const pendingCount = computed(() => traces.value.filter(tr => (tr.status ?? 'pending') === 'pending').length)

  function isPending(trace: FileEditTrace) {
    return (trace.status ?? 'pending') === 'pending'
  }

  function changeTypeBadge(changeType: string) {
    switch (changeType) {
      case 'create': return { cls: 'create', icon: 'file-plus' }
      case 'delete': return { cls: 'delete', icon: 'file-minus' }
      default: return { cls: 'modify', icon: 'file-pen' }
    }
  }

  function lineStats(trace: FileEditTrace) {
    const before = (trace.beforeContent ?? '').split('\n').filter(l => l !== '').length
    const after = (trace.afterContent ?? '').split('\n').filter(l => l !== '').length
    if (trace.changeType === 'create') return { added: after, removed: 0 }
    if (trace.changeType === 'delete') return { added: 0, removed: before }
    const delta = after - before
    return delta >= 0 ? { added: delta, removed: 0 } : { added: 0, removed: -delta }
  }

  function statusText(status: string) {
    const map: Record<string, string> = {
      pending: t('fileChange.statusPending'),
      accepted: t('fileChange.statusAccepted'),
      rolled_back: t('fileChange.statusRolledBack')
    }
    return map[status] ?? status
  }

  function selectTrace(index: number) {
    selectedIndex.value = index
  }

  function navigatePrev() {
    if (selectedIndex.value > 0) selectedIndex.value--
  }

  function navigateNext() {
    if (selectedIndex.value < traces.value.length - 1) selectedIndex.value++
  }

  async function acceptSelected() {
    const trace = selectedTrace.value
    if (trace) await fileChangeStore.accept(trace.id)
  }

  async function acceptAll() {
    await fileChangeStore.acceptAll()
  }

  async function rollbackSelected() {
    const trace = selectedTrace.value
    if (trace) await fileChangeStore.rollback(trace.id)
  }

  async function rollbackAll() {
    await fileChangeStore.rollbackAll()
  }

  return {
    t,
    EaButton,
    EaIcon,
    MonacoDiffEditor,
    selectedIndex,
    traces,
    selectedTrace,
    pendingCount,
    isPending,
    changeTypeBadge,
    lineStats,
    statusText,
    selectTrace,
    navigatePrev,
    navigateNext,
    acceptSelected,
    acceptAll,
    rollbackSelected,
    rollbackAll
  }
}
