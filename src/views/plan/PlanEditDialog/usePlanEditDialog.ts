/** usePlanEditDialog — 计划编辑弹窗组件的 composable，装配现有计划表单、代理/模型选项与记忆库挂载选择。 */
import EaModal from '@/components/common/EaModal/EaModal.vue'
import EaButton from '@/components/common/EaButton/EaButton.vue'
import { EaIcon, EaSelect } from '@/components/common'
import MemoryLibraryPicker from '@/views/memory/MemoryLibraryPicker.vue'
import type { Plan, PlanStatus } from '@/types/plan'
import type { AgentOption, ModelOption, PlanEditFormState } from '../planListShared'

export interface PlanEditDialogProps {
  visible: boolean
  plan: Plan | null
  form: PlanEditFormState
  agentOptions: AgentOption[]
  modelOptions: ModelOption[]
}

export interface PlanEditDialogEmits {
  (event: 'close'): void
  (event: 'save'): void
  (event: 'update:form', patch: Partial<PlanEditFormState>): void
}

export function usePlanEditDialog(_props: PlanEditDialogProps, emit: PlanEditDialogEmits) {
  function updateField<K extends keyof PlanEditFormState>(key: K, value: PlanEditFormState[K]) {
    emit('update:form', { [key]: value })
  }

  function canEditSchedule(status: PlanStatus | undefined): boolean {
    return status !== undefined && ['draft', 'planning', 'ready'].includes(status)
  }

  const minDateTime = new Date().toISOString().slice(0, 16)

  function isDraftEditable(status: PlanStatus | undefined): boolean {
    return status === 'draft'
  }

  return {
    updateField,
    canEditSchedule,
    minDateTime,
    isDraftEditable,
    EaModal,
    EaButton,
    EaIcon,
    EaSelect,
    MemoryLibraryPicker
  }
}
