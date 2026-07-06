/**
 * useComposerShared — 会话输入框的“响应式脊柱 + 跨切面协调器”。
 *
 * 职责说明：
 * - 一次性创建并拥有所有被多个子 composable 共享的响应式状态（DOM 引用、会话上下文、
 *   输入文本、执行态、Agent/模型/下拉、面板显隐与坐标、压缩、IME 等），以及全部 Pinia store 与 i18n。
 * - 承担仅在 setup 期注册一次的生命周期副作用（onMounted / watch / useSafeOutsideClick）。
 * - 提供被多处分发的纯协调函数：focusInput / syncScroll / 面板 open·close / 压缩对话框处理。
 * - 暴露派生计算：inputPlaceholder / tokenUsage / messageCount / shouldShowCompressButton。
 *
 * 设计约束：本模块是“单一事实源”。其余子 composable 必须以参数形式接收本模块的返回值
 * （ComposerSharedContext），严禁各自独立创建同名状态，否则会出现状态分叉。
 */
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type WritableComputedRef
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { inferAgentProvider, useAgentStore } from '@/stores/agent'
import { useMessageStore } from '@/stores/message'
import { useNotificationStore } from '@/stores/notification'
import { useProjectStore } from '@/stores/project'
import {
  useSessionExecutionStore
} from '@/stores/sessionExecution'
import { useSessionStore } from '@/stores/session'
import { useAgentPlanStore } from '@/stores/agentPlan'
import { useSettingsStore } from '@/stores/settings'
import { useTokenStore, type CompressionStrategy, type TokenLevel } from '@/stores/token'
import { useSubAgentStore } from '@/stores/subAgent'
import { compressionService } from '@/services/compression'
import { conversationService } from '@/services/conversation'
import { clearPluginCommandsCache, loadPluginSlashCommands, toSlashCommandDescriptor } from '@/services/pluginCommands'
import { registerPluginCommands, clearPluginCommands } from '@/services/slashCommands'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import { resolveSessionAgent, resolveSessionAgentId } from '@/utils/sessionAgent'
import { formatAgentModelLabel } from '@/utils/agentModelLabel'
import { getProviderReasoningEfforts, type ReasoningEffortLevel, type ReasoningEffortOption } from '@/types/reasoning'
import { resolveSubAgentById, resolveFallbackAgent } from '@/services/subAgent/runtime'
import type { UseConversationComposerOptions } from './composerHelpers'

export function useComposerShared(options: UseConversationComposerOptions) {
  const { t } = useI18n()
  const messageStore = useMessageStore()
  const sessionStore = useSessionStore()
  const settingsStore = useSettingsStore()
  const notificationStore = useNotificationStore()
  const projectStore = useProjectStore()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const tokenStore = useTokenStore()
  const agentTeamsStore = useSubAgentStore()
  const agentPlanStore = useAgentPlanStore()

  // ---- DOM 引用 ----
  const textareaRef = ref<HTMLTextAreaElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const renderLayerRef = ref<HTMLDivElement | null>(null)

  // ---- 会话上下文 ----
  const currentSessionId = computed(() => toValue(options.sessionId) || null)
  const currentSession = computed(() =>
    sessionStore.sessions.find(session => session.id === currentSessionId.value) || null
  )
  const currentProjectPath = computed(() => {
    const overridePath = toValue(options.projectPath)
    if (overridePath) {
      return overridePath
    }

    const projectId = currentSession.value?.projectId
    if (!projectId) {
      return null
    }

    return projectStore.projects.find(project => project.id === projectId)?.path || null
  })
  const currentWorkingDirectory = computed(() => toValue(options.workingDirectory) || currentProjectPath.value)

  // ---- 输入与执行态 ----
  const inputText = computed({
    get: () => currentSessionId.value ? sessionExecutionStore.getInputText(currentSessionId.value) : '',
    set: (value) => {
      if (currentSessionId.value) {
        sessionExecutionStore.setInputText(currentSessionId.value, value)
      }
    }
  }) as WritableComputedRef<string>

  const isSending = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getIsBusy(currentSessionId.value) : false
  )

  const pendingImages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getPendingImages(currentSessionId.value) : []
  )

  const queuedMessages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getQueuedMessages(currentSessionId.value) : []
  )

  const isUploadingImages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getIsUploadingImages(currentSessionId.value) : false
  )
  const dispatchingSessionId = ref<string | null>(null)
  const isCurrentSessionDispatching = computed(() => (
    Boolean(currentSessionId.value) && dispatchingSessionId.value === currentSessionId.value
  ))
  const currentFileMentions = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getFileMentions(currentSessionId.value) : []
  )

  // ---- Agent / 模型 / 专家上下文 ----
  const agentOptions = computed(() =>
    agentStore.agents.map(agent => {
      const provider = agent.provider || inferAgentProvider(agent)
      return {
        label: agent.name,
        value: agent.id,
        modelId: agent.modelId,
        provider,
        type: 'acp' as const,
        isCustom: agent.customModelEnabled || false
      }
    })
  )

  const currentExpertId = computed(() => {
    const explicitExpertId = currentSession.value?.expertId?.trim()
    return explicitExpertId || null
  })

  const currentExpert = computed(() =>
    resolveSubAgentById(currentExpertId.value, agentTeamsStore.subAgents)
  )

  const currentAgent = computed(() => {
    // 主会话直接按会话绑定的 agentId 解析 ACP 执行器，找不到则回退首个
    const resolved = resolveSessionAgent(currentSession.value, agentStore.agents)
    return resolved || resolveFallbackAgent(agentStore.agents)
  })

  // 选中高亮基准：当前会话绑定的 ACP 客户端 id
  const currentAgentId = computed(() => currentAgent.value?.id || null)

  const currentAgentName = computed(() => {
    if (currentAgent.value) {
      return currentAgent.value.name
    }
    return t('composer.selectClient')
  })

  const modelOptions = computed(() => {
    const agentId = currentAgent.value?.id
    const provider = currentAgent.value?.provider || inferAgentProvider(currentAgent.value)
    if (!agentId) return []

    return agentConfigStore.getModelsConfigs(agentId)
      .filter(config => config.enabled)
      .map(config => ({
        value: config.modelId,
        label: formatAgentModelLabel({
          provider,
          modelId: config.modelId,
          displayName: config.displayName
        }),
        isDefault: config.isDefault
      }))
  })

  const presetModelOptions = computed(() => modelOptions.value)

  // 模型下拉的名称筛选（支持 displayName / modelId 模糊匹配，不区分大小写）
  const modelFilterText = ref('')
  const filteredModelOptions = computed(() => {
    const keyword = modelFilterText.value.trim().toLowerCase()
    if (!keyword) {
      return presetModelOptions.value
    }
    return presetModelOptions.value.filter(option =>
      option.label.toLowerCase().includes(keyword)
      || option.value.toLowerCase().includes(keyword)
    )
  })

  const reasoningEffortOptions = computed<ReasoningEffortOption[]>(() => {
    const provider = currentAgent.value?.provider || inferAgentProvider(currentAgent.value) || currentAgent.value?.type || 'acp'
    if (!provider) return []
    const efforts = getProviderReasoningEfforts(provider)
    return efforts.map(effort => ({
      value: effort,
      label: t(`reasoning.${effort}`)
    }))
  })

  const selectedModelId = ref<string>('')
  const selectedReasoningEffort = ref<ReasoningEffortLevel | ''>('')

  const currentProvider = computed(() =>
    currentAgent.value ? (currentAgent.value.provider || inferAgentProvider(currentAgent.value)) : undefined
  )

  // ---- 下拉开关与引用 ----
  const isAgentDropdownOpen = ref(false)
  const agentDropdownRef = ref<HTMLElement | null>(null)
  const isModelDropdownOpen = ref(false)
  const modelDropdownRef = ref<HTMLElement | null>(null)
  const isReasoningDropdownOpen = ref(false)
  const reasoningDropdownRef = ref<HTMLElement | null>(null)

  // ---- 面板显隐与坐标（@文件提及 / 斜杠命令 / Cd 路径） ----
  const showFileMention = ref(false)
  const fileMentionPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const mentionStart = ref(-1)
  const mentionSearchText = ref('')
  const showSlashCommand = ref(false)
  const slashCommandPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const slashCommandQuery = ref('')
  const showCdPathSuggestions = ref(false)
  const cdPathPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const cdPathQuery = ref('')

  // ---- IME / 压缩 ----
  const isInputComposing = ref(false)
  const showCompressionDialog = ref(false)
  const isCompressing = ref(false)

  // ---- 派生计算 ----
  const tokenUsage = computed(() => {
    if (!currentSessionId.value) {
      return { used: 0, limit: 0, percentage: 0, level: 'safe' as TokenLevel }
    }
    return tokenStore.getTokenUsage(currentSessionId.value)
  })

  const messageCount = computed(() => {
    if (!currentSessionId.value) return 0
    return messageStore.messagesBySession(currentSessionId.value).length
  })

  const shouldShowCompressButton = computed(() => {
    return tokenUsage.value.percentage >= 50 && messageCount.value > 0
  })

  const inputPlaceholder = computed(() => {
    const shortcut = settingsStore.settings.sendOnEnter
      ? t('message.shortcutEnter')
      : t('message.shortcutModifierEnter')
    return t('message.inputPlaceholder', { shortcut })
  })

  // ---- 仅 setup 期注册一次的副作用 ----
  watch(() => currentAgent.value?.id, async (agentId) => {
    if (agentId) {
      const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === agentId))
      await agentConfigStore.ensureModelsConfigs(agentId, provider)
    }
  }, { immediate: true })

  watch([currentExpert, currentAgent], async ([_expert, agent]) => {
    if (agent?.id) {
      await agentConfigStore.ensureModelsConfigs(agent.id, inferAgentProvider(agent))
      const configs = agentConfigStore.getModelsConfigs(agent.id)
      // 子代理不再绑定模型，首选模型取执行器自身默认配置
      const defaultModel = configs.find(config => config.isDefault && config.enabled)
        || configs.find(config => config.enabled)
      selectedModelId.value = defaultModel?.modelId || ''
      selectedReasoningEffort.value = ''
    } else {
      selectedModelId.value = ''
      selectedReasoningEffort.value = ''
    }
  }, { immediate: true })

  // 将输入框当前选中的模型写入 token store，用于解析上下文容量上限（设置页配置的 contextWindow）
  watch([currentSessionId, selectedModelId], ([sessionId, modelId]) => {
    if (sessionId) {
      tokenStore.setSessionSelectedModel(sessionId, modelId.trim())
    }
  }, { immediate: true })

  watch(currentProvider, async (provider) => {
    clearPluginCommands()
    if (!provider) return

    try {
      const commands = await loadPluginSlashCommands(provider, currentProjectPath.value ?? undefined)
      registerPluginCommands(commands.map(toSlashCommandDescriptor))
    } catch {
      // silent fallback
    }
  }, { immediate: true })

  watch(currentSessionId, (sessionId) => {
    if (sessionId) {
      focusInput()
      if (currentProvider.value) {
        clearPluginCommandsCache()
        loadPluginSlashCommands(currentProvider.value, currentProjectPath.value ?? undefined)
          .then(commands => registerPluginCommands(commands.map(toSlashCommandDescriptor)))
          .catch(() => { /* silent */ })
      }
    }
  }, { immediate: true })

  onMounted(async () => {
    try {
      await Promise.all([
        agentStore.loadAgents(),
        agentTeamsStore.loadSubAgents(true)
      ])
      if (currentAgent.value?.id) {
        const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === currentAgent.value?.id))
        await agentConfigStore.ensureModelsConfigs(currentAgent.value.id, provider)
      }
    } catch (error) {
      console.error('Failed to load experts or agents:', error)
    }
  })

  onUnmounted(() => {
  })

  useSafeOutsideClick(
    () => [agentDropdownRef.value, modelDropdownRef.value, reasoningDropdownRef.value],
    () => {
      isAgentDropdownOpen.value = false
      isModelDropdownOpen.value = false
      isReasoningDropdownOpen.value = false
    }
  )

  // ---- 纯协调函数 ----
  function focusInput() {
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }

  const syncScroll = () => {
    if (textareaRef.value && renderLayerRef.value) {
      renderLayerRef.value.scrollTop = textareaRef.value.scrollTop
    }
  }

  // ---- 面板 open / close（跨多处分发，故集中在此） ----
  const closeFileMention = () => {
    showFileMention.value = false
    fileMentionPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    mentionStart.value = -1
    mentionSearchText.value = ''
  }

  const closeSlashCommand = () => {
    showSlashCommand.value = false
    slashCommandPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    slashCommandQuery.value = ''
  }

  const closeCdPathSuggestions = () => {
    showCdPathSuggestions.value = false
    cdPathPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    cdPathQuery.value = ''
  }

  const openFileMention = (x: number, y: number, query: string, start: number) => {
    if (!currentSessionId.value || !currentProjectPath.value) {
      return
    }

    closeSlashCommand()
    closeCdPathSuggestions()
    showFileMention.value = true
    fileMentionPosition.value = { x, y, width: 280, height: 0 }
    mentionStart.value = start
    mentionSearchText.value = query
  }

  const openSlashCommand = (x: number, y: number, query: string) => {
    closeCdPathSuggestions()
    closeFileMention()
    showSlashCommand.value = true
    slashCommandPosition.value = { x, y, width: 320, height: 0 }
    slashCommandQuery.value = query
  }

  const openCdPathSuggestions = (x: number, y: number, query: string) => {
    closeSlashCommand()
    closeFileMention()
    showCdPathSuggestions.value = true
    cdPathPosition.value = { x, y, width: 360, height: 0 }
    cdPathQuery.value = query
  }

  // ---- 压缩对话框 ----
  const handleOpenCompress = () => {
    showCompressionDialog.value = true
  }

  const handleConfirmCompress = async (strategy: CompressionStrategy) => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    const agentId = resolveSessionAgentId(currentSession.value, agentStore.agents) || currentAgent.value?.id

    if (!agentId) {
      notificationStore.smartError('压缩失败', new Error('未找到可用专家运行时'))
      showCompressionDialog.value = false
      return
    }

    showCompressionDialog.value = false
    isCompressing.value = true

    try {
      const result = await compressionService.compressSession(
        sessionId,
        agentId,
        {
          strategy,
          triggerSource: 'manual'
        }
      )

      if (result.success) {
        notificationStore.success(t('compression.success'))
        await conversationService.drainQueue(sessionId)
      } else {
        notificationStore.error(t('compression.failed'), result.error)
      }
    } catch (error) {
      notificationStore.smartError('压缩失败', error instanceof Error ? error : new Error(String(error)))
    } finally {
      isCompressing.value = false
      showCompressionDialog.value = false
    }
  }

  const handleCancelCompress = () => {
    showCompressionDialog.value = false
  }

  return {
    // 基础
    options,
    t,
    // stores
    messageStore,
    sessionStore,
    settingsStore,
    notificationStore,
    projectStore,
    agentStore,
    agentConfigStore,
    sessionExecutionStore,
    tokenStore,
    agentTeamsStore,
    agentPlanStore,
    // DOM 引用
    textareaRef,
    fileInputRef,
    renderLayerRef,
    // 会话上下文
    currentSessionId,
    currentSession,
    currentProjectPath,
    currentWorkingDirectory,
    // 输入与执行态
    inputText,
    isSending,
    pendingImages,
    queuedMessages,
    isUploadingImages,
    dispatchingSessionId,
    isCurrentSessionDispatching,
    currentFileMentions,
    // Agent / 模型 / 专家上下文
    agentOptions,
    currentExpertId,
    currentExpert,
    currentAgent,
    currentAgentId,
    currentAgentName,
    modelOptions,
    presetModelOptions,
    modelFilterText,
    filteredModelOptions,
    reasoningEffortOptions,
    selectedModelId,
    selectedReasoningEffort,
    currentProvider,
    // 下拉开关与引用
    isAgentDropdownOpen,
    agentDropdownRef,
    isModelDropdownOpen,
    modelDropdownRef,
    isReasoningDropdownOpen,
    reasoningDropdownRef,
    // 面板显隐与坐标
    showFileMention,
    fileMentionPosition,
    mentionStart,
    mentionSearchText,
    showSlashCommand,
    slashCommandPosition,
    slashCommandQuery,
    showCdPathSuggestions,
    cdPathPosition,
    cdPathQuery,
    // IME / 压缩
    isInputComposing,
    showCompressionDialog,
    isCompressing,
    // 派生计算
    tokenUsage,
    messageCount,
    shouldShowCompressButton,
    inputPlaceholder,
    // 协调函数
    focusInput,
    syncScroll,
    // 面板 open / close
    closeFileMention,
    closeSlashCommand,
    closeCdPathSuggestions,
    openFileMention,
    openSlashCommand,
    openCdPathSuggestions,
    // 压缩对话框
    handleOpenCompress,
    handleConfirmCompress,
    handleCancelCompress
  }
}

export type ComposerSharedContext = ReturnType<typeof useComposerShared>
