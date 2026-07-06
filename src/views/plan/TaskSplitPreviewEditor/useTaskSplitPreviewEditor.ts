/** useTaskSplitPreviewEditor — 拆分预览任务内联编辑器组件的 composable，负责字段编辑、记忆库选择与外部点击收起。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MemoryLibraryPicker from '@/views/memory/MemoryLibraryPicker.vue'
import { useSubAgentStore } from '@/stores/subAgent'
import type { AITaskItem, TaskPriority } from '@/types/plan'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'

export interface TaskSplitPreviewEditorProps {
  task: AITaskItem
  tasks: AITaskItem[]
  index: number
  priorityOptions: Array<{ label: string; value: TaskPriority }>
}

export interface TaskSplitPreviewEditorEmits {
  (event: 'save', updates: Partial<AITaskItem>): void
  (event: 'cancel'): void
}

export function useTaskSplitPreviewEditor(props: TaskSplitPreviewEditorProps, emit: TaskSplitPreviewEditorEmits) {
  const { t } = useI18n()
  const agentTeamsStore = useSubAgentStore()

  const draft = ref<AITaskItem>({
    title: '',
    description: '',
    priority: 'medium',
    expertId: '',
    implementationSteps: [],
    testSteps: [],
    acceptanceCriteria: [],
    dependsOn: []
  })

  const expertOptions = computed(() => agentTeamsStore.enabledSubAgents)

  const isDepDropdownOpen = ref(false)
  const depDropdownRef = ref<HTMLElement | null>(null)

  const availableDependencyTitles = computed(() =>
    props.tasks
      .filter((_, taskIndex) => taskIndex !== props.index)
      .map(task => task.title)
  )

  const depDropdownDisplay = computed(() => {
    const selected = draft.value.dependsOn || []
    if (selected.length === 0) {
      return t('task.selectDependencies')
    }
    return selected.join(', ')
  })

  function resetDraft() {
    const rawExpertId = props.task.expertId
    draft.value = {
      title: props.task.title || '',
      description: props.task.description || '',
      priority: props.task.priority || 'medium',
      expertId: rawExpertId || '',
      memoryLibraryIds: [...(props.task.memoryLibraryIds || [])],
      implementationSteps: [...(props.task.implementationSteps || [])],
      testSteps: [...(props.task.testSteps || [])],
      acceptanceCriteria: [...(props.task.acceptanceCriteria || [])],
      dependsOn: [...(props.task.dependsOn || [])]
    }
  }

  function addStep(type: 'implementationSteps' | 'testSteps' | 'acceptanceCriteria') {
    draft.value[type].push('')
  }

  function removeStep(type: 'implementationSteps' | 'testSteps' | 'acceptanceCriteria', index: number) {
    draft.value[type].splice(index, 1)
  }

  function toggleDepDropdown() {
    isDepDropdownOpen.value = !isDepDropdownOpen.value
  }

  function handleDependencyToggle(dependencyTitle: string) {
    const dependsOn = draft.value.dependsOn || []
    draft.value.dependsOn = dependsOn.includes(dependencyTitle)
      ? dependsOn.filter(title => title !== dependencyTitle)
      : [...dependsOn, dependencyTitle]
  }

  function isDependencySelected(dependencyTitle: string): boolean {
    return (draft.value.dependsOn || []).includes(dependencyTitle)
  }

  function removeDependency(dependencyTitle: string) {
    draft.value.dependsOn = (draft.value.dependsOn || []).filter(title => title !== dependencyTitle)
  }

  function save() {
    const updates = {
      ...draft.value,
      expertId: draft.value.expertId || undefined,
      memoryLibraryIds: [...(draft.value.memoryLibraryIds || [])],
      implementationSteps: [...draft.value.implementationSteps],
      testSteps: [...draft.value.testSteps],
      acceptanceCriteria: [...draft.value.acceptanceCriteria],
      dependsOn: [...(draft.value.dependsOn || [])]
    }
    emit('save', updates)
  }

  watch(() => [props.task, props.index], resetDraft, { immediate: true })

  useSafeOutsideClick(
    () => [depDropdownRef.value],
    () => {
      isDepDropdownOpen.value = false
    }
  )

  return {
    t,
    MemoryLibraryPicker,
    draft,
    expertOptions,
    isDepDropdownOpen,
    depDropdownRef,
    availableDependencyTitles,
    depDropdownDisplay,
    addStep,
    removeStep,
    toggleDepDropdown,
    handleDependencyToggle,
    isDependencySelected,
    removeDependency,
    save
  }
}
