<script setup lang="ts">
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
import ProviderConfigEditorModal from '@/components/settings/provider-switch/ProviderConfigEditorModal.vue'
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

// 通用删除确认：统一走全局确认弹框，按类型分发到对应 store 操作
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

// Skills 鎿嶄綔
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

// Plugins 鎿嶄綔
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
</script>

<template>
  <div class="skill-config-page">
    <!-- CLI 类型 Tab（下划线风格，与子代理页保持一致） -->
    <section
      v-if="hasCliAgents"
      class="cli-type-tabs"
    >
      <div class="tabs-wrapper">
        <button
          v-for="option in cliAgentTabs"
          :key="option.provider"
          :class="['tab-btn', { active: activeCliType === option.provider }]"
          @click="handleCliTypeChange(option.provider)"
        >
          <EaIcon
            name="terminal"
            :size="14"
          />
          <span>{{ option.label }}</span>
        </button>
      </div>
      <p class="cli-type-tabs__hint">
        {{ t('settings.agentConfig.cliConfigDirHint', { dir: currentConfigDir }) }}
      </p>
    </section>
    <div
      v-else
      class="skill-config-page__empty"
    >
      <EaIcon
        name="lucide:inbox"
        class="skill-config-page__empty-icon"
      />
      <span>{{ t('settings.agentConfig.noAgents') }}</span>
    </div>

    <!-- Skill 创建视图（全屏，命中时替换整个面板） -->
    <SkillCreateView
      v-if="showSkillBuilder && activeTab === 'skills'"
      :agent="skillConfigStore.selectedAgent"
      :cli-config-paths="skillConfigStore.cliConfigPaths"
      :is-saving="isCreatingSkill"
      @back="handleBackFromSkillBuilder"
      @save="handleCreateVisualSkill"
    />

    <!-- Plugin 详情视图 -->
    <PluginDetailView
      v-else-if="skillConfigStore.selectedPlugin && activeTab === 'plugins' && showPluginsTab"
      :plugin="skillConfigStore.selectedPlugin"
      @back="handleBackFromPlugin"
      @delete="handleDeletePluginFromDetail"
    />

    <template v-else>
      <div class="skill-config-page__tabs">
        <button
          class="skill-config-page__tab"
          :class="{ 'skill-config-page__tab--active': activeTab === 'mcp' }"
          @click="activeTab = 'mcp'"
        >
          <EaIcon name="lucide:server" />
          {{ t('settings.integration.tabs.mcp') }}
        </button>
        <button
          class="skill-config-page__tab"
          :class="{ 'skill-config-page__tab--active': activeTab === 'skills' }"
          @click="activeTab = 'skills'"
        >
          <EaIcon name="lucide:book-open" />
          {{ t('settings.integration.tabs.skills') }}
        </button>
        <button
          v-if="showPluginsTab"
          class="skill-config-page__tab"
          :class="{ 'skill-config-page__tab--active': activeTab === 'plugins' }"
          @click="activeTab = 'plugins'"
        >
          <EaIcon name="lucide:puzzle" />
          {{ t('settings.integration.tabs.plugins') }}
        </button>
      </div>

      <div
        ref="contentRef"
        class="skill-config-page__content"
      >
        <McpConfigTab
          v-if="activeTab === 'mcp'"
          :configs="skillConfigStore.mcpConfigs"
          :is-read-only="skillConfigStore.isReadOnly"
          :is-loading="skillConfigStore.isLoading"
          :can-sync="canSyncCliConfigs"
          :can-refresh="canOpenCliConfigEditor"
          :can-open-file="canOpenCliConfigEditor"
          @refresh="handleRefresh"
          @sync="openSyncModal('mcp')"
          @open-file="handleOpenFile"
          @save="handleSaveMcp"
          @delete="handleDeleteMcp"
        />
        <!-- skills tab：选中技能时左右分屏（列表常驻 + 详情撑满），否则单列列表 -->
        <div
          v-if="activeTab === 'skills'"
          class="skill-config-page__skills-panel"
          :class="{ 'skill-config-page__skills-panel--split': !!skillConfigStore.selectedSkill }"
        >
          <SkillsConfigTab
            class="skill-config-page__skills-list"
            :configs="skillConfigStore.skillsConfigs"
            :is-read-only="skillConfigStore.isReadOnly"
            :is-loading="skillConfigStore.isLoading"
            :can-sync="canSyncCliConfigs"
            @add="handleAddSkill"
            @sync="openSyncModal('skills')"
            @detail="handleViewSkillDetail"
            @edit="handleEditSkill"
            @delete="handleDeleteSkill"
          />
          <SkillDetailView
            v-if="skillConfigStore.selectedSkill"
            class="skill-config-page__skills-detail"
            :skill="skillConfigStore.selectedSkill"
            @back="handleBackFromSkill"
            @delete="handleDeleteSkillFromDetail"
          />
        </div>
        <PluginsConfigTab
          v-else-if="activeTab === 'plugins' && showPluginsTab"
          :configs="skillConfigStore.pluginsConfigs"
          :is-read-only="skillConfigStore.isReadOnly"
          :is-loading="skillConfigStore.isLoading"
          :can-refresh="canOpenCliConfigEditor"
          :can-open-file="canOpenCliConfigEditor"
          @add="handleAddPlugin"
          @refresh="handleRefresh"
          @open-file="handleOpenFile"
          @detail="handleViewPluginDetail"
          @edit="handleEditPlugin"
          @delete="handleDeletePlugin"
        />
      </div>
    </template>

    <CliConfigSyncModal
      :visible="showSyncModal"
      :sync-type="syncType"
      :agents="agentStore.agents"
      :selected-agent="skillConfigStore.selectedAgent"
      @close="showSyncModal = false"
      @completed="handleSyncCompleted"
    />

    <SkillEditModal
      v-model:visible="showSkillModal"
      :config="editingSkill"
      @save="handleSaveSkill"
    />

    <PluginEditModal
      v-model:visible="showPluginModal"
      :config="editingPlugin"
      @save="handleSavePlugin"
    />

    <ProviderConfigEditorModal
      v-model:visible="showConfigEditor"
      :loading="isConfigEditorLoading"
      :saving="isConfigEditorSaving"
      :file="configEditorFile"
      :content="configEditorContent"
      :dirty="isConfigEditorDirty"
      :locate-target="configEditorLocateTarget"
      @update:content="configEditorContent = $event"
      @reload="handleReloadConfigEditor"
      @format="handleFormatConfigEditor"
      @save="handleSaveConfigEditor"
    />
  </div>
</template>
<style scoped src="./SkillConfigPage.css"></style>
