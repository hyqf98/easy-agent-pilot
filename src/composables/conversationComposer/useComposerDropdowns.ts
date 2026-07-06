/**
 * useComposerDropdowns — Agent / 模型 / 推理强度 三个工具栏下拉的交互逻辑。
 *
 * 职责说明：
 * - 处理左侧 Agent 下拉（toggleAgentDropdown / selectAgent）。
 * - 处理模型下拉（toggleModelDropdown / selectModel / getModelLabel）。
 * - 处理推理强度下拉（toggleReasoningDropdown / selectReasoningEffort / getReasoningEffortLabel）。
 * 下拉的“开关状态”与“DOM 引用”由 useComposerShared 统一持有（因 useSafeOutsideClick 与
 * 斜杠命令的 openModelPicker 均会跨模块改写这些 ref），本模块仅消费共享上下文。
 */
import { inferAgentProvider } from '@/stores/agent'
import type { ReasoningEffortLevel } from '@/types/reasoning'
import type { ComposerSharedContext } from './useComposerShared'

export function useComposerDropdowns(ctx: ComposerSharedContext) {
  const {
    t,
    agentStore,
    agentConfigStore,
    sessionStore,
    currentSessionId,
    currentAgent,
    modelOptions,
    selectedModelId,
    selectedReasoningEffort,
    isAgentDropdownOpen,
    isModelDropdownOpen,
    isReasoningDropdownOpen,
    modelFilterText
  } = ctx

  const toggleAgentDropdown = () => {
    isAgentDropdownOpen.value = !isAgentDropdownOpen.value
    if (isAgentDropdownOpen.value) {
      isModelDropdownOpen.value = false
      isReasoningDropdownOpen.value = false
    }
  }

  // 选中某个 ACP 客户端，绑定到当前会话（主会话不再使用专家/子代理）
  const selectAgent = async (agentId: string) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      isAgentDropdownOpen.value = false
      return
    }

    try {
      const agent = agentStore.agents.find(item => item.id === agentId)
      if (agent?.id) {
        await agentConfigStore.ensureModelsConfigs(agent.id, inferAgentProvider(agent))
      }
      await sessionStore.updateSession(sessionId, {
        expertId: '',
        agentId: agent?.id,
        agentType: agent?.provider || agent?.type || 'claude',
        cliSessionId: '',
        cliSessionProvider: ''
      })
      const configs = agent?.id
        ? agentConfigStore.getModelsConfigs(agent.id).filter(config => config.enabled)
        : []
      const matchedModel = configs.find(config => config.modelId === agent?.modelId)
        || configs.find(config => config.isDefault)
        || configs[0]
      selectedModelId.value = matchedModel?.modelId || ''
      isAgentDropdownOpen.value = false
    } catch (error) {
      console.error('Failed to update session agent:', error)
    }
  }

  const toggleModelDropdown = () => {
    isModelDropdownOpen.value = !isModelDropdownOpen.value
    if (isModelDropdownOpen.value) {
      isAgentDropdownOpen.value = false
      isReasoningDropdownOpen.value = false
      modelFilterText.value = ''
    }
  }

  const selectModel = async (modelId: string) => {
    if (!currentAgent.value) return

    selectedModelId.value = modelId
    isModelDropdownOpen.value = false

    try {
      const runtimeAgentId = currentAgent.value.id
      const configs = agentConfigStore.getModelsConfigs(runtimeAgentId)
      const selectedConfig = configs.find(config => config.modelId === modelId)
      if (selectedConfig) {
        await agentConfigStore.updateModelConfig(selectedConfig.id, runtimeAgentId, {
          isDefault: true
        })
      }
      // 子代理不再持有 defaultModelId（模型跟随 ACP 执行器），模型默认值由上方
      // agentConfigStore.updateModelConfig 持久化到执行器配置。
    } catch (error) {
      console.error('Failed to update expert model:', error)
    }
  }

  const getModelLabel = (modelId: string) => {
    const model = modelOptions.value.find(item => item.value === modelId)
    return model ? model.label : modelId || '使用默认模型'
  }

  const toggleReasoningDropdown = () => {
    isReasoningDropdownOpen.value = !isReasoningDropdownOpen.value
    if (isReasoningDropdownOpen.value) {
      isAgentDropdownOpen.value = false
      isModelDropdownOpen.value = false
    }
  }

  const selectReasoningEffort = (effort: ReasoningEffortLevel | '') => {
    selectedReasoningEffort.value = effort
    isReasoningDropdownOpen.value = false
  }

  const getReasoningEffortLabel = (effort: ReasoningEffortLevel | '') => {
    if (!effort) return t('reasoning.default')
    return t(`reasoning.${effort}`)
  }

  return {
    toggleAgentDropdown,
    selectAgent,
    toggleModelDropdown,
    selectModel,
    getModelLabel,
    toggleReasoningDropdown,
    selectReasoningEffort,
    getReasoningEffortLabel
  }
}
