import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useTaskStore } from '@/stores/task'
import type { Task, TaskPriority } from '@/types/plan'

export interface KanbanCardProps {
  task: Task
}

export interface KanbanCardEmits {
  (event: 'click', task: Task): void
  (event: 'start', task: Task): void
  (event: 'stop', task: Task): void
  (event: 'resume', task: Task): void
  (event: 'retry', task: Task): void
  (event: 'edit', task: Task): void
  (event: 'delete', task: Task): void
}

export function useKanbanCard(props: KanbanCardProps, emit: KanbanCardEmits) {
  const taskExecutionStore = useTaskExecutionStore()
  const taskStore = useTaskStore()
  const { t } = useI18n()

  const isExecuting = computed(() => {
    return taskExecutionStore.isTaskExecuting(props.task.id)
  })

  // 是否正在运行（不包含排队中）
  const isRunning = computed(() => {
    return taskExecutionStore.isTaskRunning(props.task.id)
  })

  const isStopped = computed(() => {
    return taskExecutionStore.isTaskStopped(props.task.id)
  })

  // 是否等待用户输入
  const isWaitingInput = computed(() => {
    return props.task.status === 'blocked' && props.task.blockReason === 'waiting_input'
  })

  // 排队位置
  const queuePosition = computed(() => {
    return taskExecutionStore.getQueuePosition(props.task.id)
  })

  const unmetDependenciesCount = computed(() => {
    return taskStore.getUnmetDependenciesCount(props.task.id)
  })

  const executionStatusText = computed(() => {
    if (isWaitingInput.value) return t('task.execution.waitingInput')
    if (isStopped.value) return t('task.execution.stopped')
    if (isRunning.value) return t('task.execution.running')
    if (queuePosition.value > 0) return t('task.execution.queued', { position: queuePosition.value })
    if (unmetDependenciesCount.value > 0) {
      return t('task.execution.waitingDependencies', { count: unmetDependenciesCount.value })
    }
    return ''
  })

  // 是否显示停止按钮
  const showStopButton = computed(() => {
    return isRunning.value
  })

  const showResumeButton = computed(() => {
    return isStopped.value && props.task.status === 'in_progress'
  })

  const showStartButton = computed(() => {
    return props.task.status === 'pending' && !isExecuting.value
  })

  const showRetryButton = computed(() => {
    return props.task.status === 'failed'
  })

  const showDeleteButton = computed(() => {
    return !isRunning.value
  })

  const showEditButton = computed(() => {
    if (isRunning.value) return false
    if (props.task.status === 'completed') return false
    return true
  })

  // 优先级颜色
  const priorityColors: Record<TaskPriority, string> = {
    low: 'gray',
    medium: 'yellow',
    high: 'red'
  }

  // 获取优先级标签
  function getPriorityLabel(priority: TaskPriority): string {
    return t(`task.priority.${priority}`)
  }

  // 获取优先级颜色
  function getPriorityColor(priority: TaskPriority): string {
    return priorityColors[priority] || 'gray'
  }

  // 点击卡片
  function handleClick() {
    emit('click', props.task)
  }

  function handleStop(event: Event) {
    event.stopPropagation()
    emit('stop', props.task)
  }

  function handleStart(event: Event) {
    event.stopPropagation()
    emit('start', props.task)
  }

  function handleResume(event: Event) {
    event.stopPropagation()
    emit('resume', props.task)
  }

  function handleRetry(event: Event) {
    event.stopPropagation()
    emit('retry', props.task)
  }

  function handleEdit(event: Event) {
    event.stopPropagation()
    emit('edit', props.task)
  }

  function handleDelete(event: Event) {
    event.stopPropagation()
    emit('delete', props.task)
  }

  return {
    t,
    isExecuting,
    isRunning,
    isStopped,
    isWaitingInput,
    queuePosition,
    unmetDependenciesCount,
    executionStatusText,
    showStopButton,
    showResumeButton,
    showStartButton,
    showRetryButton,
    showDeleteButton,
    showEditButton,
    priorityColors,
    getPriorityLabel,
    getPriorityColor,
    handleClick,
    handleStop,
    handleStart,
    handleResume,
    handleRetry,
    handleEdit,
    handleDelete
  }
}
