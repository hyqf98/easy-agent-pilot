/** usePlanSplitConfigDialog — 计划拆分配置弹窗组件的 composable，装配拆分表单、代理/模型选项与提交逻辑。 */
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
