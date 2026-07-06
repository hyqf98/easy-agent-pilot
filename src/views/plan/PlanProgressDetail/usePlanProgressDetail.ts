import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirmDialog } from '@/composables'
import { useAgentStore } from '@/stores/agent'
import { useSubAgentStore } from '@/stores/subAgent'
import { usePlanStore } from '@/stores/plan'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useTaskStore } from '@/stores/task'
import type { PlanExecutionProgress, PlanExecutionTaskProgress } from '@/types/taskExecution'
import {
  buildPlanExecutionSnapshot,
  resolvePlanTaskAgentSelection
} from '@/utils/planExecutionProgress'

export interface PlanProgressDetailProps {
  planId: string
}

export interface PlanProgressDetailEmits {
  (event: 'task-select', taskId: string): void
}

export function usePlanProgressDetail(props: PlanProgressDetailProps, emit: PlanProgressDetailEmits) {
  const taskExecutionStore = useTaskExecutionStore()
  const taskStore = useTaskStore()
  const planStore = usePlanStore()
  const agentStore = useAgentStore()
  const agentTeamsStore = useSubAgentStore()
  const confirmDialog = useConfirmDialog()
  const { t, locale } = useI18n()

  const isLoading = ref(false)
  const isClearing = ref(false)
  const progress = ref<PlanExecutionProgress | null>(null)

  const plan = computed(() => planStore.plans.find(item => item.id === props.planId) || null)

  const snapshot = computed(() =>
    buildPlanExecutionSnapshot(progress.value, plan.value?.currentTaskId ?? null)
  )

  const summaryStats = computed(() => ({
    total: snapshot.value.totalTasks,
    pending: progress.value?.pending_count ?? 0,
    inProgress: progress.value?.in_progress_count ?? 0,
    completed: progress.value?.completed_count ?? 0,
    blocked: progress.value?.blocked_count ?? 0,
    failed: snapshot.value.failedTasks.length,
    cancelled: progress.value?.cancelled_count ?? 0
  }))

  const statusCards = computed(() => [
    { key: 'total', label: t('taskBoard.planOverview.totalTasks'), value: summaryStats.value.total, tone: 'neutral' },
    { key: 'pending', label: t('taskBoard.planOverview.pendingTasks'), value: summaryStats.value.pending, tone: 'pending' },
    { key: 'in_progress', label: t('taskBoard.planOverview.inProgressTasks'), value: summaryStats.value.inProgress, tone: 'progress' },
    { key: 'completed', label: t('taskBoard.columns.completed'), value: summaryStats.value.completed, tone: 'success' },
    { key: 'blocked', label: t('taskBoard.planOverview.blockedTasks'), value: summaryStats.value.blocked, tone: 'warning' },
    { key: 'failed', label: t('taskBoard.planOverview.statusFailed'), value: summaryStats.value.failed, tone: 'danger' }
  ])

  const failureTasks = computed(() =>
    snapshot.value.failedTasks
      .map(task => ({
        id: task.task_id,
        title: task.title,
        reason: task.last_fail_reason || task.last_result_summary || t('taskBoard.planOverview.noFailureReason')
      }))
  )

  const overviewContent = computed(() =>
    progress.value?.execution_overview?.trim()
    || plan.value?.executionOverview?.trim()
    || ''
  )

  const overviewUpdatedAt = computed(() =>
    progress.value?.execution_overview_updated_at
    || plan.value?.executionOverviewUpdatedAt
    || null
  )

  function formatPlanStatus(status?: string): string {
    switch (status) {
      case 'draft': return t('taskBoard.planOverview.planStatuses.draft')
      case 'planning': return t('taskBoard.planOverview.planStatuses.planning')
      case 'ready': return t('taskBoard.planOverview.planStatuses.ready')
      case 'executing': return t('taskBoard.planOverview.planStatuses.executing')
      case 'completed': return t('taskBoard.planOverview.planStatuses.completed')
      case 'paused': return t('taskBoard.planOverview.planStatuses.paused')
      default: return status || t('taskBoard.planOverview.planStatuses.unknown')
    }
  }

  function formatTaskStatus(status: string): string {
    switch (status) {
      case 'pending': return t('taskDetail.statuses.pending')
      case 'in_progress': return t('taskDetail.statuses.in_progress')
      case 'completed': return t('taskDetail.statuses.completed')
      case 'blocked': return t('taskDetail.statuses.blocked')
      case 'failed': return t('taskDetail.statuses.failed')
      case 'cancelled': return t('taskDetail.statuses.cancelled')
      default: return status
    }
  }

  function formatRelativeTime(date: string | null | undefined): string {
    if (!date) return t('common.none')

    const target = new Date(date)
    if (Number.isNaN(target.getTime())) return t('common.none')

    const diff = Date.now() - target.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes <= 0) return t('common.justNow')
    if (minutes < 60) return t('common.minutesAgo', { n: minutes })
    if (hours < 24) return t('common.hoursAgo', { n: hours })
    if (days < 7) return t('common.daysAgo', { n: days })

    return target.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function compactText(content: string | null | undefined, fallback: string = ''): string {
    const normalized = (content || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return fallback
    return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
  }

  function resolveAgentLabel(task: PlanExecutionTaskProgress): string {
    const selection = resolvePlanTaskAgentSelection(task, plan.value)
    const expert = selection.expertId
      ? agentTeamsStore.getSubAgentById(selection.expertId)
      : null
    if (expert) {
      return selection.modelId ? `${expert.name} / ${selection.modelId}` : expert.name
    }
    if (!selection.agentId) {
      return t('taskDetail.unspecified')
    }

    const agent = agentStore.agents.find(item => item.id === selection.agentId)
    const baseLabel = agent?.name || selection.agentId
    return selection.modelId ? `${baseLabel} / ${selection.modelId}` : baseLabel
  }

  const taskRows = computed(() =>
    snapshot.value.orderedTasks.map(task => ({
      id: task.task_id,
      title: task.title,
      statusLabel: formatTaskStatus(task.status),
      statusClass: `status-${task.status}`,
      agentLabel: resolveAgentLabel(task),
      summary: compactText(
        task.last_result_summary,
        task.status === 'completed'
          ? t('taskBoard.planOverview.noSummaryCompleted')
          : t('taskBoard.planOverview.noResult')
      ),
      failReason: compactText(task.last_fail_reason, ''),
      updatedAt: formatRelativeTime(task.updated_at),
      isActive: snapshot.value.activeTask?.task_id === task.task_id
    }))
  )

  async function loadProgress() {
    if (!props.planId) return
    isLoading.value = true
    try {
      progress.value = await taskExecutionStore.getPlanExecutionProgress(props.planId)
    } finally {
      isLoading.value = false
    }
  }

  async function handleClearLogs() {
    const confirmed = await confirmDialog.danger(
      t('taskBoard.planOverview.clearProgressConfirm'),
      t('taskBoard.planOverview.clearProgressTitle')
    )

    if (!confirmed) return

    isClearing.value = true
    try {
      await taskExecutionStore.clearPlanExecutionResults(props.planId)
      await loadProgress()
    } finally {
      isClearing.value = false
    }
  }

  function handleTaskSelect(taskId: string) {
    emit('task-select', taskId)
  }

  watch(
    () => props.planId,
    () => {
      void loadProgress()
    }
  )

  watch(
    () => [
      plan.value?.currentTaskId,
      plan.value?.updatedAt,
      taskStore.tasks
        .filter(task => task.planId === props.planId)
        .map(task => `${task.id}:${task.status}:${task.updatedAt}:${task.agentId || ''}:${task.modelId || ''}`)
        .join('|')
    ],
    () => {
      void loadProgress()
    }
  )

  onMounted(async () => {
    if (agentStore.agents.length === 0) {
      await agentStore.loadAgents()
    }
    if (agentTeamsStore.subAgents.length === 0) {
      await agentTeamsStore.loadSubAgents()
    }
    await loadProgress()
  })

  return {
    t,
    locale,
    isLoading,
    isClearing,
    plan,
    snapshot,
    summaryStats,
    statusCards,
    failureTasks,
    overviewContent,
    overviewUpdatedAt,
    taskRows,
    formatPlanStatus,
    formatTaskStatus,
    formatRelativeTime,
    loadProgress,
    compactText,
    handleClearLogs,
    handleTaskSelect
  }
}
