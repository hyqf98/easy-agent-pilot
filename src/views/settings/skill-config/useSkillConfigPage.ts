/**
 * useSkillConfigPage — 技能配置页（SkillConfigPage）的全部业务逻辑。
 *
 * 职责：
 * 1. 管理顶部「按 provider 去重的 CLI 智能 Tab 列表」与当前选中 agent 的联动；
 * 2. 管理 mcp / skills / plugins 三个内部 Tab 的切换、空状态与滚动重置；
 * 3. 统一封装三类配置（MCP / Skill / Plugin）的增删改查，并通过全局确认弹框处理删除；
 * 4. 基于当前 agent 的 provider 决定是否可打开 CLI 配置编辑器、是否可同步；
 * 5. 串联 SkillCreateView（可视化创建）、SkillDetailView / PluginDetailView（详情）等子视图；
 * 6. 通过 useDefaultCliConfigEditor 管理 CLI 配置文件的读取 / 编辑 / 保存 / 重载。
 *
 * 该组件无 props / emits，故 composable 不接收参数；
 * 所有模板需要消费的 ref、computed、方法、子组件、store 均通过 return 暴露。
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore, type AgentConfig, inferAgentProvider, type AgentProvider } from '@/stores/agent'
import { useProjectStore } from '@/stores/project'
import { useSkillConfigStore, type UnifiedMcpConfig, type UnifiedSkillConfig, type UnifiedPluginConfig } from '@/stores/skillConfig'
import type { CliType } from '@/stores/providerProfile'
import {
  useDefaultCliConfigEditor
} from '@/composables/useDefaultCliConfigEditor'
import McpConfigTab from './tabs/McpConfigTab.vue'
import SkillsConfigTab from './tabs/SkillsConfigTab.vue'
import PluginsConfigTab from './tabs/PluginsConfigTab.vue'
import CliConfigSyncModal from './modals/cliConfigSyncModal/CliConfigSyncModal.vue'
import SkillEditModal from './modals/SkillEditModal.vue'
import PluginEditModal from './modals/PluginEditModal.vue'
import SkillCreateView from './skills/SkillCreateView.vue'
import SkillDetailView from './views/SkillDetailView.vue'
import PluginDetailView from './views/PluginDetailView.vue'
import ProviderConfigEditorModal from '@/views/settings/provider-switch/ProviderConfigEditorModal.vue'
import { EaIcon } from '@/components/common'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import type { CliSyncResult, CreateVisualSkillInput, SyncConfigType } from '@/stores/skillConfig'

/** 仅这三个 CLI 类型用 Tab 切换（与子代理页保持一致，无下拉框）。 */
type CliTabProvider = Extract<AgentProvider, 'claude' | 'codex' | 'opencode'>

/** 固定展示顺序。 */
const CLI_TAB_ORDER: CliTabProvider[] = ['claude', 'codex', 'opencode']

/** provider → Tab 标签。 */
const CLI_TAB_LABEL: Record<CliTabProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
}

/** provider → 配置目录（cliConfigPaths 缺省时的静态回退）。 */
const CLI_CONFIG_DIR_FALLBACK: Record<CliTabProvider, string> = {
  claude: '~/.claude',
  codex: '~/.codex',
  opencode: '~/.config/opencode',
}

/**
 * SkillConfigPage 组件的 composable。
 * 组件无 props / emits，故不接收参数。
 */
export function useSkillConfigPage() {
  const { t } = useI18n()
  const agentStore = useAgentStore()
  const projectStore = useProjectStore()
  const skillConfigStore = useSkillConfigStore()
  const confirmDialog = useConfirmDialog()

  const activeTab = ref<'mcp' | 'skills' | 'plugins'>('mcp')

  const showPluginsTab = computed(() => skillConfigStore.supportsPlugins)

  /**
   * 按 provider 去重的 CLI 智能 Tab 列表。
   * CLI 配置读盘路径由 provider 决定，与同 provider 内具体哪个 agent 无关，
   * 故每个 provider 只取首个代表 agent 即可。
   */
  const cliAgentTabs = computed<Array<{ provider: CliTabProvider; label: string; agent: AgentConfig }>>(() => {
    const byProvider = new Map<CliTabProvider, AgentConfig>()
    for (const agent of agentStore.agents) {
      if (!(agent.acpCommand || agent.cliPath)) {
        continue
      }
      const provider = inferAgentProvider(agent)
      if (provider !== 'claude' && provider !== 'codex' && provider !== 'opencode') {
        continue
      }
      if (!byProvider.has(provider)) {
        byProvider.set(provider, agent)
      }
    }

    return CLI_TAB_ORDER
      .filter(provider => byProvider.has(provider))
      .map(provider => ({
        provider,
        label: CLI_TAB_LABEL[provider],
        agent: byProvider.get(provider)!,
      }))
  })

  const hasCliAgents = computed(() => cliAgentTabs.value.length > 0)

  /** 当前选中的 CLI 类型（取所选 agent 的 provider，inferAgentProvider 兜底）。 */
  const activeCliType = computed<CliTabProvider | null>(() => {
    const agent = skillConfigStore.selectedAgent
    if (!agent) {
      return null
    }
    const provider = inferAgentProvider(agent)
    if (provider === 'claude' || provider === 'codex' || provider === 'opencode') {
      return provider
    }
    return null
  })

  /** 当前 provider 的配置目录预览（优先用真实路径，缺省回退静态映射）。 */
  const currentConfigDir = computed(() => {
    const provider = activeCliType.value
    if (!provider) {
      return ''
    }
    return skillConfigStore.cliConfigPaths?.configDir
      || CLI_CONFIG_DIR_FALLBACK[provider]
  })

  function handleCliTypeChange(provider: CliTabProvider) {
    const tab = cliAgentTabs.value.find(item => item.provider === provider)
    if (!tab || tab.agent.id === skillConfigStore.selectedAgent?.id) {
      return
    }
    void handleSelectAgent(tab.agent)
  }

  const selectedCliType = computed<CliType | null>(() => {
    const provider = skillConfigStore.selectedAgent?.provider
    if (provider === 'claude' || provider === 'codex' || provider === 'opencode') {
      return provider
    }
    return null
  })

  const canOpenCliConfigEditor = computed(() => selectedCliType.value !== null)

  // 内容区域引用，用于重置滚动位置
  const contentRef = ref<HTMLElement | null>(null)
  const showSyncModal = ref(false)
  const syncType = ref<SyncConfigType>('mcp')
  const showSkillModal = ref(false)
  const showPluginModal = ref(false)
  const showSkillBuilder = ref(false)
  const isCreatingSkill = ref(false)
  const editingSkill = ref<UnifiedSkillConfig | null>(null)
  const editingPlugin = ref<UnifiedPluginConfig | null>(null)
  const {
    configEditorContent,
    configEditorFile,
    configEditorLocateTarget,
    formatConfigEditor: handleFormatConfigEditor,
    isConfigEditorDirty,
    isConfigEditorLoading,
    isConfigEditorSaving,
    openConfigEditor,
    reloadConfigEditor,
    resetConfigEditor,
    saveConfigEditor: handleSaveConfigEditor,
    showConfigEditor
  } = useDefaultCliConfigEditor({
    onAfterSave: async () => {
      await skillConfigStore.refreshCliConfigs()
    }
  })

  watch(activeTab, () => {
    if (activeTab.value !== 'skills') {
      showSkillBuilder.value = false
    }

    nextTick(() => {
      if (contentRef.value) {
        contentRef.value.scrollTop = 0
      }
    })
  })

  watch(
    () => [activeTab.value, skillConfigStore.selectedAgent?.id] as const,
    ([tab, agentId]) => {
      if (!agentId) {
        return
      }

      if (tab === 'skills' || tab === 'plugins') {
        void skillConfigStore.ensureCliInventoryLoaded()
      }
    },
    { immediate: true }
  )

  watch(showSkillModal, (value) => {
    if (!value) {
      editingSkill.value = null
    }
  })

  // 守卫：当前 Agent 不支持插件（如 codex）时，若停留在已隐藏的 plugins Tab，回退到 mcp
  watch(showPluginsTab, (visible) => {
    if (!visible && activeTab.value === 'plugins') {
      activeTab.value = 'mcp'
    }
  })

  watch(showPluginModal, (value) => {
    if (!value) {
      editingPlugin.value = null
    }
  })

  watch(
    () => skillConfigStore.selectedAgent?.id,
    () => {
      resetConfigEditor()
    }
  )

  watch(
    () => projectStore.currentProject?.path,
    (nextPath, prevPath) => {
      if (nextPath === prevPath || !skillConfigStore.selectedAgent) {
        return
      }

      void skillConfigStore.refreshCliConfigs()
    }
  )

  /**
   * 通用删除确认：统一走全局确认弹框，按类型分发到对应 store 操作。
   * @param type   配置类型 mcp / skills / plugins
   * @param config 待删除的配置项
   */
  async function requestDelete(
    type: 'mcp' | 'skills' | 'plugins',
    config: UnifiedMcpConfig | UnifiedSkillConfig | UnifiedPluginConfig
  ) {
    const confirmed = await confirmDialog.danger(
      t('settings.sdkConfig.confirmDeleteMessage'),
      t('common.confirmDelete')
    )
    if (!confirmed) {
      return
    }

    switch (type) {
      case 'mcp':
        await skillConfigStore.deleteMcpConfig((config as UnifiedMcpConfig).id)
        break
      case 'skills':
        await skillConfigStore.deleteSkillWithFiles(config as UnifiedSkillConfig)
        break
      case 'plugins':
        await skillConfigStore.deletePluginWithFiles(config as UnifiedPluginConfig)
        break
    }
  }

  // 加载智能体列表，并自动选中首个 CLI Tab（若无选中）
  onMounted(async () => {
    await agentStore.loadAgents()
    autoSelectFirstCliTab()
  })

  // 兜底：异步加载完成后，若仍无选中，自动选中首个 CLI Tab
  watch(() => agentStore.agents, () => {
    autoSelectFirstCliTab()
  })

  function autoSelectFirstCliTab() {
    if (skillConfigStore.selectedAgent) {
      return
    }
    const first = cliAgentTabs.value[0]
    if (first) {
      void handleSelectAgent(first.agent)
    }
  }

  // 选择智能体
  async function handleSelectAgent(agent: any) {
    showSkillBuilder.value = false
    showSkillModal.value = false
    showPluginModal.value = false
    editingSkill.value = null
    editingPlugin.value = null
    await skillConfigStore.selectAgent(agent)
  }

  // MCP 操作
  async function handleSaveMcp(config: Partial<UnifiedMcpConfig>, originalId?: string) {
    if (originalId) {
      await skillConfigStore.updateMcpConfig(originalId, config)
    } else {
      await skillConfigStore.createMcpConfig({
        ...config,
        id: '',
        source: 'database',
        isReadOnly: false,
      } as any)
    }
  }

  function handleDeleteMcp(config: UnifiedMcpConfig) {
    void requestDelete('mcp', config)
  }

  // Skills 操作
  async function handleAddSkill() {
    const agent = skillConfigStore.selectedAgent
    if (!agent) {
      return
    }

    await openSkillManualCreate(agent)
  }

  async function openSkillManualCreate(agent: AgentConfig) {
    if (agent.cliPath || agent.acpCommand) {
      await skillConfigStore.resolveCliConfigPaths(agent)
      showSkillBuilder.value = true
      return
    }

    editingSkill.value = null
    showSkillModal.value = true
  }

  // Plugins 操作
  function handleAddPlugin() {
    const agent = skillConfigStore.selectedAgent
    if (!agent) {
      return
    }

    openPluginManualCreate()
  }

  function openPluginManualCreate() {
    editingPlugin.value = null
    showPluginModal.value = true
  }

  function handleViewSkillDetail(config: UnifiedSkillConfig) {
    skillConfigStore.viewSkillDetail(config)
  }

  function handleEditSkill(config: UnifiedSkillConfig) {
    editingSkill.value = config
    showSkillModal.value = true
  }

  function handleDeleteSkill(config: UnifiedSkillConfig) {
    void requestDelete('skills', config)
  }

  function handleBackFromSkill() {
    skillConfigStore.clearDetailState()
  }

  async function handleDeleteSkillFromDetail(skill: UnifiedSkillConfig) {
    void requestDelete('skills', skill)
  }

  async function handleSaveSkill(config: Partial<UnifiedSkillConfig>, originalId?: string) {
    if (originalId) {
      await skillConfigStore.updateSkillsConfig(originalId, config)
    } else {
      const payload: Omit<UnifiedSkillConfig, 'id' | 'source' | 'isReadOnly'> = {
        ...config,
        enabled: true,
      } as Omit<UnifiedSkillConfig, 'id' | 'source' | 'isReadOnly'>
      await skillConfigStore.createSkillsConfig(payload)
    }

    showSkillModal.value = false
    editingSkill.value = null
  }

  function handleBackFromSkillBuilder() {
    showSkillBuilder.value = false
  }

  async function handleCreateVisualSkill(input: CreateVisualSkillInput) {
    isCreatingSkill.value = true
    try {
      await skillConfigStore.createVisualSkill(input)
      showSkillBuilder.value = false
    } finally {
      isCreatingSkill.value = false
    }
  }

  function handleViewPluginDetail(config: UnifiedPluginConfig) {
    skillConfigStore.viewPluginDetail(config)
  }

  function handleEditPlugin(config: UnifiedPluginConfig) {
    editingPlugin.value = config
    showPluginModal.value = true
  }

  async function handleSavePlugin(config: Partial<UnifiedPluginConfig>, originalId?: string) {
    if (originalId) {
      await skillConfigStore.updatePluginsConfig(originalId, config)
    } else {
      const payload: Omit<UnifiedPluginConfig, 'id' | 'source' | 'isReadOnly'> = {
        ...config,
        enabled: true,
      } as Omit<UnifiedPluginConfig, 'id' | 'source' | 'isReadOnly'>
      await skillConfigStore.createPluginsConfig(payload)
    }

    showPluginModal.value = false
    editingPlugin.value = null
  }

  function handleDeletePlugin(config: UnifiedPluginConfig) {
    void requestDelete('plugins', config)
  }

  function handleBackFromPlugin() {
    skillConfigStore.clearDetailState()
  }

  async function handleDeletePluginFromDetail(plugin: UnifiedPluginConfig) {
    void requestDelete('plugins', plugin)
  }

  async function handleRefresh() {
    await skillConfigStore.refreshCliConfigs()
  }

  async function handleOpenFile() {
    if (!selectedCliType.value) {
      return
    }

    await openConfigEditor(selectedCliType.value)
  }

  async function handleReloadConfigEditor() {
    if (!selectedCliType.value) {
      return
    }

    await reloadConfigEditor(selectedCliType.value)
  }

  const canSyncCliConfigs = computed(() => {
    const agent = skillConfigStore.selectedAgent
    if (!agent) {
      return false
    }

    if (agent.provider !== 'claude' && agent.provider !== 'codex' && agent.provider !== 'opencode') {
      return false
    }

    return agentStore.agents.some(
      item =>
        item.id !== agent.id
        && !!(item.acpCommand || item.cliPath)
        && item.provider
        && item.provider !== agent.provider
        && (item.provider === 'claude' || item.provider === 'codex' || item.provider === 'opencode')
    )
  })

  function openSyncModal(type: SyncConfigType) {
    syncType.value = type
    showSyncModal.value = true
  }

  function handleSyncCompleted(payload: { targetAgentId: string; result: CliSyncResult }) {
    if (payload.result.successCount === 0) {
      return
    }

    if (skillConfigStore.selectedAgent?.id === payload.targetAgentId) {
      void skillConfigStore.refreshCliConfigs()
    }
  }

  return {
    // 子组件
    CliConfigSyncModal,
    EaIcon,
    McpConfigTab,
    PluginDetailView,
    PluginEditModal,
    PluginsConfigTab,
    ProviderConfigEditorModal,
    SkillCreateView,
    SkillDetailView,
    SkillEditModal,
    SkillsConfigTab,
    // store
    agentStore,
    skillConfigStore,
    // i18n
    t,
    // CLI Tab
    cliAgentTabs,
    hasCliAgents,
    activeCliType,
    currentConfigDir,
    handleCliTypeChange,
    // 编辑器能力
    canOpenCliConfigEditor,
    canSyncCliConfigs,
    // ref 状态
    contentRef,
    showSyncModal,
    syncType,
    showSkillModal,
    showPluginModal,
    showSkillBuilder,
    isCreatingSkill,
    editingSkill,
    editingPlugin,
    activeTab,
    showPluginsTab,
    // 配置编辑器状态
    showConfigEditor,
    configEditorContent,
    configEditorFile,
    configEditorLocateTarget,
    isConfigEditorDirty,
    isConfigEditorLoading,
    isConfigEditorSaving,
    // MCP / Skill / Plugin 操作
    handleSaveMcp,
    handleDeleteMcp,
    handleAddSkill,
    handleViewSkillDetail,
    handleEditSkill,
    handleDeleteSkill,
    handleBackFromSkill,
    handleDeleteSkillFromDetail,
    handleSaveSkill,
    handleBackFromSkillBuilder,
    handleCreateVisualSkill,
    handleAddPlugin,
    handleViewPluginDetail,
    handleEditPlugin,
    handleSavePlugin,
    handleDeletePlugin,
    handleBackFromPlugin,
    handleDeletePluginFromDetail,
    handleRefresh,
    handleOpenFile,
    handleReloadConfigEditor,
    handleFormatConfigEditor,
    handleSaveConfigEditor,
    handleSyncCompleted,
    openSyncModal
  }
}
