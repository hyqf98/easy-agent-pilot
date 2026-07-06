/** useTaskSplitPreviewCard — 拆分预览单任务卡片组件的 composable，派生优先级配色并触发编辑/删除。 */
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSubAgentStore } from '@/stores/subAgent'
import type { AITaskItem, TaskPriority } from '@/types/plan'

export interface TaskSplitPreviewCardProps {
  task: AITaskItem
  index: number
  priorityColors: Record<TaskPriority, string>
  disableActions?: boolean
}

export interface TaskSplitPreviewCardEmits {
  (event: 'edit'): void
  (event: 'remove'): void
}

export function useTaskSplitPreviewCard(_props: TaskSplitPreviewCardProps, emit: TaskSplitPreviewCardEmits) {
  const { t } = useI18n()
  const agentTeamsStore = useSubAgentStore()

  onMounted(() => {
    if (agentTeamsStore.subAgents.length === 0) {
      void agentTeamsStore.loadSubAgents()
    }
  })

  function getPriorityLabel(priority: TaskPriority) {
    return t(`taskSplit.priority.${priority}`)
  }

  function getExpertLabel(expertId?: string): string {
    if (!expertId) {
      return t('taskSplit.noExpertAssigned')
    }
    return agentTeamsStore.getSubAgentById(expertId)?.name || expertId
  }

  function onCardClick() {
    emit('edit')
  }

  return {
    t,
    getPriorityLabel,
    getExpertLabel,
    onCardClick
  }
}
