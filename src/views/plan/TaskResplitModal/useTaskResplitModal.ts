import { ref, computed, watch } from 'vue'
import { useAgentStore, useAgentConfigStore } from '@/stores'
import { useSubAgentStore } from '@/stores/subAgent'
import { inferAgentProvider } from '@/stores/agent'
import type { AgentModelConfig } from '@/stores/agentConfig'
import type { AITaskItem, TaskResplitConfig } from '@/types/plan'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import { DEFAULT_SPLIT_GRANULARITY } from '@/constants/plan'
import { resolveSubAgentById, resolveSubAgentExecutionWithFallback } from '@/services/subAgent/runtime'

export interface TaskResplitModalProps {
  visible: boolean
  task: AITaskItem | null
  defaultGranularity: number
  defaultExpertId?: string
  defaultModelId?: string
}

export interface TaskResplitModalEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'confirm', config: TaskResplitConfig): void
}

export function useTaskResplitModal(props: TaskResplitModalProps, emit: TaskResplitModalEmits) {
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  const agentTeamsStore = useSubAgentStore()

  // 表单状态
  const customPrompt = ref('')
  const granularity = ref(DEFAULT_SPLIT_GRANULARITY)
  const selectedExpertId = ref<string | undefined>(undefined)
  const selectedAgentId = ref<string | undefined>(undefined)
  const selectedModelId = ref<string | undefined>(undefined)

  const availableExperts = computed(() => agentTeamsStore.enabledSubAgents)

  const availableModels = computed(() => {
    if (!selectedAgentId.value) return []
    return agentConfigStore.getModelsConfigs(selectedAgentId.value)
  })

  // 重置表单
  function resetForm() {
    customPrompt.value = ''
    granularity.value = props.defaultGranularity || DEFAULT_SPLIT_GRANULARITY
    selectedExpertId.value = props.defaultExpertId
    selectedModelId.value = props.defaultModelId
  }

  // 关闭弹框
  function close() {
    emit('update:visible', false)
  }

  const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(close)

  function handleConfirm() {
    emit('confirm', {
      taskIndex: 0, // taskIndex 由父组件设置
      customPrompt: customPrompt.value.trim() || undefined,
      granularity: granularity.value,
      expertId: selectedExpertId.value,
      agentId: selectedAgentId.value,
      modelId: selectedModelId.value
    })
    close()
  }

  watch(() => props.visible, (newVisible) => {
    if (newVisible) {
      resetForm()
      void Promise.all([
        agentStore.loadAgents(),
        agentTeamsStore.loadSubAgents(true)
      ]).then(() => {
        selectedExpertId.value = props.defaultExpertId
      })
    }
  })

  watch(selectedExpertId, async (newExpertId) => {
    const expert = resolveSubAgentById(newExpertId, agentTeamsStore.subAgents)
    const runtime = resolveSubAgentExecutionWithFallback(expert, agentStore.agents, selectedModelId.value)
    selectedAgentId.value = runtime?.agent.id

    if (runtime?.agent.id) {
      const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === runtime.agent.id))
      await agentConfigStore.ensureModelsConfigs(runtime.agent.id, provider)
      const models = agentConfigStore.getModelsConfigs(runtime.agent.id)
      const hasSelectedModel = models.some((model: AgentModelConfig) => model.modelId === selectedModelId.value)
      if (!hasSelectedModel) {
        const preferredModel = models.find((model: AgentModelConfig) => model.modelId === props.defaultModelId)
        const defaultModel = models.find((model: AgentModelConfig) => model.isDefault)
        selectedModelId.value = preferredModel?.modelId || defaultModel?.modelId || models[0]?.modelId
      }
    } else {
      selectedAgentId.value = undefined
      selectedModelId.value = undefined
    }
  })

  return {
    customPrompt,
    granularity,
    selectedExpertId,
    selectedAgentId,
    selectedModelId,
    availableExperts,
    availableModels,
    close,
    handleOverlayPointerDown,
    handleOverlayClick,
    handleConfirm
  }
}
