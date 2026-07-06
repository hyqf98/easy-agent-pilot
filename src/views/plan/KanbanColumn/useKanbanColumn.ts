/** useKanbanColumn — KanbanColumn 看板列组件的 composable，负责按状态聚合任务、拖拽排序与计数展示。 */
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import KanbanCard from '../KanbanCard/KanbanCard.vue'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import type { Task, TaskStatus } from '@/types/plan'

export interface KanbanColumnProps {
  status: TaskStatus
  title: string
  color: string
  tasks: Task[]
  globalPaused?: boolean
  executionEnabled?: boolean
}

export interface KanbanColumnEmits {
  (event: 'taskDrop', taskId: string, status: TaskStatus): void
  (event: 'taskClick', task: Task): void
  (event: 'taskStart', task: Task): void
  (event: 'taskReorder', taskId: string, targetIndex: number): void
  (event: 'taskEdit', task: Task): void
  (event: 'taskStop', task: Task): void
  (event: 'taskResume', task: Task): void
  (event: 'taskRetry', task: Task): void
  (event: 'taskDelete', task: Task): void
  (event: 'executeAll'): void
  (event: 'startExecution'): void
  (event: 'toggleGlobalExecution'): void
  (event: 'addTask'): void
}

export function useKanbanColumn(props: KanbanColumnProps, emit: KanbanColumnEmits) {
  const taskExecutionStore = useTaskExecutionStore()
  const { t } = useI18n()

  const localTasks = ref<Task[]>([...(props.tasks || [])])

  let lastTasksSnapshot: string = ''

  watch(() => props.tasks, (newTasks) => {
    const snapshot = JSON.stringify((newTasks || []).map(t => ({
      id: t.id,
      status: t.status,
      dependencies: t.dependencies,
      order: t.order
    })))
    if (snapshot !== lastTasksSnapshot) {
      localTasks.value = [...(newTasks || [])]
      lastTasksSnapshot = snapshot
    }
  }, { immediate: true })

  const dragGroup = computed(() => ({
    name: 'tasks',
    pull: (value: any) => {
      const taskId = value?.element?.id
      if (taskId && taskExecutionStore.isTaskRunning(taskId)) {
        return false
      }
      return true
    },
    put: true
  }))

  function checkMove(evt: any): boolean {
    const task = evt.draggedContext?.element
    if (!task) return true

    if (taskExecutionStore.isTaskRunning(task.id)) {
      return false
    }
    return true
  }

  function onDragChange(evt: any) {
    if (evt.added) {
      const { element } = evt.added
      emit('taskDrop', element.id, props.status)
    } else if (evt.moved) {
      // 同列内移动
      const { element, newIndex } = evt.moved
      emit('taskReorder', element.id, newIndex)
    }
  }

  function handleTaskClick(task: Task) {
    emit('taskClick', task)
  }

  function handleTaskEdit(task: Task) {
    emit('taskEdit', task)
  }

  function handleTaskStart(task: Task) {
    emit('taskStart', task)
  }

  function handleTaskStop(task: Task) {
    emit('taskStop', task)
  }

  function handleTaskResume(task: Task) {
    emit('taskResume', task)
  }

  function handleTaskRetry(task: Task) {
    emit('taskRetry', task)
  }

  function handleTaskDelete(task: Task) {
    emit('taskDelete', task)
  }

  function handleExecuteAll() {
    emit('executeAll')
  }

  function handleStartExecution() {
    emit('startExecution')
  }

  function handleToggleGlobalExecution() {
    emit('toggleGlobalExecution')
  }

  function handleAddTask() {
    emit('addTask')
  }

  return {
    t,
    taskExecutionStore,
    draggable,
    KanbanCard,
    localTasks,
    dragGroup,
    checkMove,
    onDragChange,
    handleTaskClick,
    handleTaskEdit,
    handleTaskStart,
    handleTaskStop,
    handleTaskResume,
    handleTaskRetry,
    handleTaskDelete,
    handleExecuteAll,
    handleStartExecution,
    handleToggleGlobalExecution,
    handleAddTask
  }
}
