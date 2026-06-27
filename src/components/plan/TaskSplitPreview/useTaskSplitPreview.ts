import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AITaskItem, TaskPriority } from '@/types/plan'
import { useConfirmDialog } from '@/composables'
import EaModal from '@/components/common/EaModal/EaModal.vue'
import TaskSplitPreviewCard from '../TaskSplitPreviewCard/TaskSplitPreviewCard.vue'
import TaskSplitPreviewEditor from '../TaskSplitPreviewEditor/TaskSplitPreviewEditor.vue'

export interface TaskSplitPreviewProps {
  tasks: AITaskItem[]
  disableActions?: boolean
}

export interface TaskSplitPreviewEmits {
  (event: 'update', index: number, updates: Partial<AITaskItem>): void
  (event: 'remove', index: number): void
  (event: 'add', task: AITaskItem): void
}

export function useTaskSplitPreview(props: TaskSplitPreviewProps, emit: TaskSplitPreviewEmits) {
  const PENDING_ADD_INDEX = -1

  const editingIndex = ref<number | null>(null)
  const editorRef = ref<InstanceType<typeof TaskSplitPreviewEditor> | null>(null)
  const confirmDialog = useConfirmDialog()
  const { t } = useI18n()

  const pendingNewTask = ref<AITaskItem | null>(null)

  const priorityOptions = computed(() => [
    { label: t('taskSplit.priority.low'), value: 'low' as const },
    { label: t('taskSplit.priority.medium'), value: 'medium' as const },
    { label: t('taskSplit.priority.high'), value: 'high' as const }
  ])

  const priorityColors: Record<TaskPriority, string> = {
    low: 'green',
    medium: 'yellow',
    high: 'red'
  }

  const editingTask = computed(() => {
    if (editingIndex.value === null) return null
    if (editingIndex.value === PENDING_ADD_INDEX) return pendingNewTask.value
    return props.tasks[editingIndex.value] ?? null
  })

  function startEdit(index: number) {
    if (props.disableActions) {
      return
    }
    editingIndex.value = index
  }

  function cancelEdit() {
    pendingNewTask.value = null
    editingIndex.value = null
  }

  function saveEdit(index: number, updates: Partial<AITaskItem>) {
    if (index === PENDING_ADD_INDEX) {
      emit('add', { ...pendingNewTask.value!, ...updates })
      pendingNewTask.value = null
    } else {
      emit('update', index, updates)
    }
    editingIndex.value = null
  }

  function saveEditFromModal() {
    editorRef.value?.triggerSave()
  }

  async function removeTask(index: number) {
    if (props.disableActions) {
      return
    }
    const task = props.tasks[index]
    const taskName = task?.title?.trim() || `${t('taskSplit.newTask')} ${index + 1}`
    const confirmed = await confirmDialog.danger(
      t('taskSplit.removeTaskConfirmMessage', { name: taskName }),
      t('taskSplit.removeTaskConfirmTitle')
    )

    if (confirmed) {
      emit('remove', index)
      if (editingIndex.value === index) {
        editingIndex.value = null
      }
    }
  }

  function addTask() {
    if (props.disableActions) {
      return
    }

    pendingNewTask.value = {
      title: '',
      description: '',
      priority: 'medium',
      memoryLibraryIds: [],
      implementationSteps: [],
      testSteps: [],
      acceptanceCriteria: [],
      dependsOn: []
    }
    editingIndex.value = PENDING_ADD_INDEX
  }

  watch(
    () => props.disableActions,
    (disabled) => {
      if (disabled && editingIndex.value !== null) {
        cancelEdit()
      }
    }
  )

  return {
    t,
    EaModal,
    TaskSplitPreviewCard,
    TaskSplitPreviewEditor,
    editingIndex,
    editorRef,
    pendingNewTask,
    priorityOptions,
    priorityColors,
    editingTask,
    startEdit,
    cancelEdit,
    saveEdit,
    saveEditFromModal,
    removeTask,
    addTask
  }
}
