/** usePlanCreateDialog — 计划创建弹窗组件的 composable，装配表单字段、代理/模型选项与记忆库挂载选择。 */
import EaModal from '@/components/common/EaModal/EaModal.vue'
import EaButton from '@/components/common/EaButton/EaButton.vue'
import { EaIcon, EaSelect } from '@/components/common'
import MemoryLibraryPicker from '@/views/memory/MemoryLibraryPicker.vue'
import type { AgentOption, ModelOption, PlanCreateFormState } from '../planListShared'

export interface PlanCreateDialogProps {
  visible: boolean
  form: PlanCreateFormState
  agentOptions: AgentOption[]
  modelOptions: ModelOption[]
  canSaveDraft: boolean
  canStartSplit: boolean
}

export interface PlanCreateDialogEmits {
  (event: 'close'): void
  (event: 'saveDraft'): void
  (event: 'startSplit'): void
  (event: 'createManual'): void
  (event: 'update:form', patch: Partial<PlanCreateFormState>): void
}

export function usePlanCreateDialog(props: PlanCreateDialogProps, emit: PlanCreateDialogEmits) {
  function updateField<K extends keyof PlanCreateFormState>(key: K, value: PlanCreateFormState[K]) {
    emit('update:form', { [key]: value })
  }

  const minDateTime = new Date().toISOString().slice(0, 16)

  // 是否为 AI 模式
  const isAiMode = () => props.form.splitMode === 'ai'

  return {
    updateField,
    minDateTime,
    isAiMode,
    EaModal,
    EaButton,
    EaIcon,
    EaSelect,
    MemoryLibraryPicker
  }
}
