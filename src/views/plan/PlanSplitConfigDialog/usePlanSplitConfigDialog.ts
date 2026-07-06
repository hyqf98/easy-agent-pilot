import EaModal from '@/components/common/EaModal/EaModal.vue'
import EaButton from '@/components/common/EaButton/EaButton.vue'
import { EaIcon } from '@/components/common'
import type { Plan } from '@/types/plan'
import type { AgentOption, ModelOption, PlanSplitConfigFormState } from '../planListShared'

export interface PlanSplitConfigDialogProps {
  visible: boolean
  plan: Plan | null
  form: PlanSplitConfigFormState
  agentOptions: AgentOption[]
  modelOptions: ModelOption[]
  canStart: boolean
}

export interface PlanSplitConfigDialogEmits {
  (event: 'close'): void
  (event: 'start'): void
  (event: 'update:form', patch: Partial<PlanSplitConfigFormState>): void
}

export function usePlanSplitConfigDialog(_props: PlanSplitConfigDialogProps, emit: PlanSplitConfigDialogEmits) {
  function updateField<K extends keyof PlanSplitConfigFormState>(key: K, value: PlanSplitConfigFormState[K]) {
    emit('update:form', { [key]: value })
  }

  return {
    updateField,
    EaModal,
    EaButton,
    EaIcon
  }
}
