/** useTaskListOptimizeModal — 任务列表优化弹窗组件的 composable，配置优化参数并调用子代理重写任务列表。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore, useAgentConfigStore } from '@/stores'
import { useSubAgentStore } from '@/stores/subAgent'
import { inferAgentProvider } from '@/stores/agent'
import type { AgentModelConfig } from '@/stores/agentConfig'
import type { TaskListOptimizeConfig } from '@/types/plan'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import { resolveSubAgentById, resolveSubAgentExecutionWithFallback } from '@/services/subAgent/runtime'

export interface TaskListOptimizeModalProps {
  visible: boolean
  taskCount: number
  defaultExpertId?: string
  defaultModelId?: string
}

export interface TaskListOptimizeModalEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'confirm', config: TaskListOptimizeConfig): void
}

export function useTaskListOptimizeModal(props: TaskListOptimizeModalProps, emit: TaskListOptimizeModalEmits) {
  const { t } = useI18n()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  const agentTeamsStore = useSubAgentStore()

  const customPrompt = ref('')
  const selectedExpertId = ref<string | undefined>(undefined)
  const selectedAgentId = ref<string | undefined>(undefined)
  const selectedModelId = ref<string | undefined>(undefined)

  const availableExperts = computed(() => agentTeamsStore.enabledSubAgents)
  const availableModels = computed(() => {
    if (!selectedAgentId.value) return []
    return agentConfigStore.getModelsConfigs(selectedAgentId.value)
  })

  function resetForm() {
    customPrompt.value = ''
    selectedExpertId.value = props.defaultExpertId
    selectedModelId.value = props.defaultModelId
  }

  function close() {
    emit('update:visible', false)
  }

  const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(close)

  function handleConfirm() {
    emit('confirm', {
      customPrompt: customPrompt.value.trim() || undefined,
      expertId: selectedExpertId.value,
      agentId: selectedAgentId.value,
      modelId: selectedModelId.value
    })
    close()
  }

  watch(() => props.visible, (visible) => {
    if (!visible) {
      return
    }

    resetForm()
    void Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents(true)
    ]).then(() => {
      selectedExpertId.value = props.defaultExpertId
    })
  })

  watch(selectedExpertId, async (newExpertId) => {
    const expert = resolveSubAgentById(newExpertId, agentTeamsStore.subAgents)
    const runtime = resolveSubAgentExecutionWithFallback(expert, agentStore.agents, selectedModelId.value)
    selectedAgentId.value = runtime?.agent.id

    if (!runtime?.agent.id) {
      selectedAgentId.value = undefined
      selectedModelId.value = undefined
      return
    }

    const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === runtime.agent.id))
    await agentConfigStore.ensureModelsConfigs(runtime.agent.id, provider)
    const models = agentConfigStore.getModelsConfigs(runtime.agent.id)
    const hasSelectedModel = models.some((model: AgentModelConfig) => model.modelId === selectedModelId.value)
    if (!hasSelectedModel) {
      const preferredModel = models.find((model: AgentModelConfig) => model.modelId === props.defaultModelId)
      const defaultModel = models.find((model: AgentModelConfig) => model.isDefault)
      selectedModelId.value = preferredModel?.modelId || defaultModel?.modelId || models[0]?.modelId
    }
  })

  return {
    t,
    customPrompt,
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
