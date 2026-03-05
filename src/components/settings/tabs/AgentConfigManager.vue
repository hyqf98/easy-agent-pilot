<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '@/stores/agent'
import {
  useAgentConfigStore,
  type AgentMcpConfig,
  type AgentSkillsConfig,
  type AgentPluginsConfig,
  type McpTransportType,
  type McpConfigScope
} from '@/stores/agentConfig'
import { EaButton, EaIcon } from '@/components/common'
import ClaudeConfigScanModal from '@/components/agent/ClaudeConfigScanModal.vue'
import ModelManageModal from './ModelManageModal.vue'

const { t } = useI18n()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()

// 当前选中的智能体 ID
const selectedAgentId = ref<string | null>(null)

// 当前标签页
const activeTab = ref<'models' | 'mcp' | 'skills' | 'plugins'>('models')

// 扫描弹窗状态
const showScanModal = ref(false)

// 模型管理弹窗状态
const showModelManageModal = ref(false)

// 弹窗状态
const showMcpModal = ref(false)
const showSkillsModal = ref(false)
const showPluginsModal = ref(false)
const editingMcpConfig = ref<AgentMcpConfig | null>(null)
const editingSkillsConfig = ref<AgentSkillsConfig | null>(null)
const editingPluginsConfig = ref<AgentPluginsConfig | null>(null)
const showDeleteConfirm = ref(false)
const deletingConfig = ref<{ type: 'mcp' | 'skills' | 'plugins'; id: string } | null>(null)

// MCP 表单
const mcpForm = ref({
  name: '',
  transportType: 'stdio' as McpTransportType,
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
  scope: 'user' as McpConfigScope
})

// Skills 表单
const skillsForm = ref({
  name: '',
  description: '',
  skillPath: '',
  scriptsPath: '',
  referencesPath: '',
  assetsPath: ''
})

// Plugins 表单
const pluginsForm = ref({
  name: '',
  version: '',
  description: '',
  pluginPath: ''
})

// 计算属性：当前选中的智能体
const selectedAgent = computed(() => {
  if (!selectedAgentId.value) return null
  return agentStore.agents.find(a => a.id === selectedAgentId.value) || null
})

// 计算属性：是否为 SDK 类型智能体
const isSdkAgent = computed(() => selectedAgent.value?.type === 'sdk')

// 计算属性：是否为 CLI 类型智能体
const isCliAgent = computed(() => selectedAgent.value?.type === 'cli')

// 智能体选择器选项
const agentOptions = computed(() => {
  return agentStore.agents.map(agent => ({
    id: agent.id,
    name: agent.name,
    type: agent.type,
    provider: agent.provider || 'claude'
  }))
})

// 按类型分组的智能体
const groupedAgents = computed(() => {
  const cli: Array<{ id: string; name: string; provider: string }> = []
  const sdk: Array<{ id: string; name: string; provider: string }> = []

  agentOptions.value.forEach(agent => {
    if (agent.type === 'cli') {
      cli.push(agent)
    } else {
      sdk.push(agent)
    }
  })

  return { cli, sdk }
})

// 计算属性：配置列表
const mcpConfigs = computed(() => {
  if (!selectedAgentId.value || !isSdkAgent.value) return []
  return agentConfigStore.getMcpConfigs(selectedAgentId.value)
})

const skillsConfigs = computed(() => {
  if (!selectedAgentId.value || !isSdkAgent.value) return []
  return agentConfigStore.getSkillsConfigs(selectedAgentId.value)
})

const pluginsConfigs = computed(() => {
  if (!selectedAgentId.value || !isSdkAgent.value) return []
  return agentConfigStore.getPluginsConfigs(selectedAgentId.value)
})

const modelConfigs = computed(() => {
  if (!selectedAgentId.value) return []
  return agentConfigStore.getModelsConfigs(selectedAgentId.value)
})

// 传输类型选项
const transportTypeOptions = computed(() => [
  { value: 'stdio', label: 'STDIO' },
  { value: 'sse', label: 'SSE' },
  { value: 'http', label: 'HTTP' }
])

// 配置范围选项
const scopeOptions = computed(() => [
  { value: 'user', label: t('settings.agent.scan.scopeTypes.user') },
  { value: 'local', label: t('settings.agent.scan.scopeTypes.local') },
  { value: 'project', label: t('settings.agent.scan.scopeTypes.project') }
])

// 打开扫描弹窗
const openScanModal = () => {
  showScanModal.value = true
}

// 关闭扫描弹窗
const closeScanModal = () => {
  showScanModal.value = false
}

// 模型管理操作
const handleOpenModelManage = () => {
  if (!selectedAgentId.value) return
  showModelManageModal.value = true
}

const handleCloseModelManage = () => {
  showModelManageModal.value = false
}

// MCP 相关操作
const handleAddMcp = () => {
  editingMcpConfig.value = null
  mcpForm.value = {
    name: '',
    transportType: 'stdio',
    command: '',
    args: '',
    env: '',
    url: '',
    headers: '',
    scope: 'user'
  }
  showMcpModal.value = true
}

const handleEditMcp = (config: AgentMcpConfig) => {
  editingMcpConfig.value = config
  mcpForm.value = {
    name: config.name,
    transportType: config.transportType,
    command: config.command || '',
    args: config.args || '',
    env: config.env || '',
    url: config.url || '',
    headers: config.headers || '',
    scope: config.scope
  }
  showMcpModal.value = true
}

const handleSaveMcp = async () => {
  if (!mcpForm.value.name.trim() || !selectedAgentId.value) return

  if (editingMcpConfig.value) {
    await agentConfigStore.updateMcpConfig(editingMcpConfig.value.id, selectedAgentId.value, {
      name: mcpForm.value.name,
      transportType: mcpForm.value.transportType,
      command: mcpForm.value.command || undefined,
      args: mcpForm.value.args || undefined,
      env: mcpForm.value.env || undefined,
      url: mcpForm.value.url || undefined,
      headers: mcpForm.value.headers || undefined,
      scope: mcpForm.value.scope
    })
  } else {
    await agentConfigStore.createMcpConfig({
      agentId: selectedAgentId.value,
      name: mcpForm.value.name,
      transportType: mcpForm.value.transportType,
      command: mcpForm.value.command || undefined,
      args: mcpForm.value.args || undefined,
      env: mcpForm.value.env || undefined,
      url: mcpForm.value.url || undefined,
      headers: mcpForm.value.headers || undefined,
      scope: mcpForm.value.scope,
      enabled: true
    })
  }
  showMcpModal.value = false
}

const handleToggleMcp = async (config: AgentMcpConfig) => {
  if (!selectedAgentId.value) return
  await agentConfigStore.updateMcpConfig(config.id, selectedAgentId.value, {
    enabled: !config.enabled
  })
}

const handleDeleteMcp = (id: string) => {
  deletingConfig.value = { type: 'mcp', id }
  showDeleteConfirm.value = true
}

// Skills 相关操作
const handleAddSkills = () => {
  editingSkillsConfig.value = null
  skillsForm.value = {
    name: '',
    description: '',
    skillPath: '',
    scriptsPath: '',
    referencesPath: '',
    assetsPath: ''
  }
  showSkillsModal.value = true
}

const handleEditSkills = (config: AgentSkillsConfig) => {
  editingSkillsConfig.value = config
  skillsForm.value = {
    name: config.name,
    description: config.description || '',
    skillPath: config.skillPath,
    scriptsPath: config.scriptsPath || '',
    referencesPath: config.referencesPath || '',
    assetsPath: config.assetsPath || ''
  }
  showSkillsModal.value = true
}

const handleSaveSkills = async () => {
  if (!skillsForm.value.name.trim() || !skillsForm.value.skillPath.trim() || !selectedAgentId.value) return

  if (editingSkillsConfig.value) {
    await agentConfigStore.updateSkillsConfig(editingSkillsConfig.value.id, selectedAgentId.value, {
      name: skillsForm.value.name,
      description: skillsForm.value.description || undefined,
      skillPath: skillsForm.value.skillPath,
      scriptsPath: skillsForm.value.scriptsPath || undefined,
      referencesPath: skillsForm.value.referencesPath || undefined,
      assetsPath: skillsForm.value.assetsPath || undefined
    })
  } else {
    await agentConfigStore.createSkillsConfig({
      agentId: selectedAgentId.value,
      name: skillsForm.value.name,
      description: skillsForm.value.description || undefined,
      skillPath: skillsForm.value.skillPath,
      scriptsPath: skillsForm.value.scriptsPath || undefined,
      referencesPath: skillsForm.value.referencesPath || undefined,
      assetsPath: skillsForm.value.assetsPath || undefined,
      enabled: true
    })
  }
  showSkillsModal.value = false
}

const handleToggleSkills = async (config: AgentSkillsConfig) => {
  if (!selectedAgentId.value) return
  await agentConfigStore.updateSkillsConfig(config.id, selectedAgentId.value, {
    enabled: !config.enabled
  })
}

const handleDeleteSkills = (id: string) => {
  deletingConfig.value = { type: 'skills', id }
  showDeleteConfirm.value = true
}

// Plugins 相关操作
const handleAddPlugins = () => {
  editingPluginsConfig.value = null
  pluginsForm.value = {
    name: '',
    version: '',
    description: '',
    pluginPath: ''
  }
  showPluginsModal.value = true
}

const handleEditPlugins = (config: AgentPluginsConfig) => {
  editingPluginsConfig.value = config
  pluginsForm.value = {
    name: config.name,
    version: config.version || '',
    description: config.description || '',
    pluginPath: config.pluginPath
  }
  showPluginsModal.value = true
}

const handleSavePlugins = async () => {
  if (!pluginsForm.value.name.trim() || !pluginsForm.value.pluginPath.trim() || !selectedAgentId.value) return

  if (editingPluginsConfig.value) {
    await agentConfigStore.updatePluginsConfig(editingPluginsConfig.value.id, selectedAgentId.value, {
      name: pluginsForm.value.name,
      version: pluginsForm.value.version || undefined,
      description: pluginsForm.value.description || undefined,
      pluginPath: pluginsForm.value.pluginPath
    })
  } else {
    await agentConfigStore.createPluginsConfig({
      agentId: selectedAgentId.value,
      name: pluginsForm.value.name,
      version: pluginsForm.value.version || undefined,
      description: pluginsForm.value.description || undefined,
      pluginPath: pluginsForm.value.pluginPath,
      enabled: true
    })
  }
  showPluginsModal.value = false
}

const handleTogglePlugins = async (config: AgentPluginsConfig) => {
  if (!selectedAgentId.value) return
  await agentConfigStore.updatePluginsConfig(config.id, selectedAgentId.value, {
    enabled: !config.enabled
  })
}

const handleDeletePlugins = (id: string) => {
  deletingConfig.value = { type: 'plugins', id }
  showDeleteConfirm.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!deletingConfig.value || !selectedAgentId.value) return

  switch (deletingConfig.value.type) {
    case 'mcp':
      await agentConfigStore.deleteMcpConfig(deletingConfig.value.id, selectedAgentId.value)
      break
    case 'skills':
      await agentConfigStore.deleteSkillsConfig(deletingConfig.value.id, selectedAgentId.value)
      break
    case 'plugins':
      await agentConfigStore.deletePluginsConfig(deletingConfig.value.id, selectedAgentId.value)
      break
  }
  showDeleteConfirm.value = false
  deletingConfig.value = null
}

// 获取传输类型标签颜色
const getTransportTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    stdio: 'var(--color-primary)',
    sse: 'var(--color-success)',
    http: 'var(--color-info, #60a5fa)'
  }
  return colors[type] || 'var(--color-text-secondary)'
}

// 监听智能体列表变化，自动选择第一个
watch(
  () => agentStore.agents,
  (agents) => {
    if (agents.length > 0 && !selectedAgentId.value) {
      selectedAgentId.value = agents[0].id
    } else if (agents.length === 0) {
      selectedAgentId.value = null
    }
  },
  { immediate: true }
)

// 监听智能体切换，加载配置
watch(
  selectedAgentId,
  async (newAgentId) => {
    if (newAgentId) {
      if (isSdkAgent.value) {
        // SDK 类型加载所有配置
        await agentConfigStore.loadAllConfigs(newAgentId)
      } else {
        // CLI 类型只加载模型配置
        await agentConfigStore.loadModelsConfigs(newAgentId)
      }
    }
  }
)

// 组件挂载时加载智能体列表
onMounted(() => {
  agentStore.loadAgents()
})
</script>

<template>
  <div class="agent-config-page">
    <!-- 顶部：智能体下拉框筛选 -->
    <div class="agent-config-page__header">
      <div class="agent-config-page__title-row">
        <h3 class="agent-config-page__title">
          {{ t('settings.agentConfig.title') }}
        </h3>
        <div class="agent-selector">
          <div class="agent-selector__wrapper">
            <EaIcon
              name="bot"
              class="agent-selector__prefix-icon"
              :size="16"
            />
            <select
              v-model="selectedAgentId"
              class="agent-selector__select"
              :class="{ 'agent-selector__select--placeholder': !selectedAgentId }"
            >
              <option
                value=""
                disabled
              >
                {{ t('settings.agentConfig.selectAgentPlaceholder') }}
              </option>
              <!-- CLI 类型智能体 -->
              <optgroup
                v-if="groupedAgents.cli.length > 0"
                :label="t('settings.agentConfig.cliAgents')"
              >
                <option
                  v-for="agent in groupedAgents.cli"
                  :key="agent.id"
                  :value="agent.id"
                >
                  {{ agent.name }} ({{ agent.provider === 'claude' ? 'Claude CLI' : 'Codex CLI' }})
                </option>
              </optgroup>
              <!-- SDK 类型智能体 -->
              <optgroup
                v-if="groupedAgents.sdk.length > 0"
                :label="t('settings.agentConfig.sdkAgents')"
              >
                <option
                  v-for="agent in groupedAgents.sdk"
                  :key="agent.id"
                  :value="agent.id"
                >
                  {{ agent.name }} ({{ agent.provider === 'claude' ? 'Claude SDK' : 'Codex SDK' }})
                </option>
              </optgroup>
            </select>
            <EaIcon
              name="chevron-down"
              class="agent-selector__icon"
              :size="16"
            />
          </div>
          <!-- 当前智能体信息标签 -->
          <div
            v-if="selectedAgent"
            class="agent-selector__info"
          >
            <span
              class="agent-selector__type-badge"
              :class="isSdkAgent ? 'agent-selector__type-badge--sdk' : 'agent-selector__type-badge--cli'"
            >
              {{ isSdkAgent ? 'SDK' : 'CLI' }}
            </span>
            <EaIcon
              :name="isSdkAgent ? 'database' : 'folder'"
              :size="12"
            />
            <span class="agent-selector__source">
              {{ isSdkAgent ? t('settings.agentConfig.configSourceDb') : t('settings.agentConfig.configSourceFs') }}
            </span>
          </div>
        </div>
      </div>
      <p class="agent-config-page__description">
        {{ t('settings.agentConfig.description') }}
      </p>
    </div>

    <!-- 空状态：未选择智能体 -->
    <div
      v-if="!selectedAgentId"
      class="config-empty"
    >
      <EaIcon
        name="bot"
        :size="48"
        class="config-empty__icon"
      />
      <p class="config-empty__text">
        {{ agentStore.agents.length === 0
          ? t('settings.agentConfig.noAgents')
          : t('settings.agentConfig.pleaseSelectAgent') }}
      </p>
      <p
        v-if="agentStore.agents.length === 0"
        class="config-empty__hint"
      >
        {{ t('settings.agentConfig.noAgentsHint') }}
      </p>
    </div>

    <!-- CLI 类型智能体：显示扫描功能（也作为默认 fallback) -->
    <div
      v-else-if="isCliAgent || !selectedAgent?.type"
      class="cli-config-section"
    >
      <div class="cli-config-section__header">
        <h4 class="cli-config-section__title">
          {{ t('settings.agentConfig.cliConfigTitle') }}
        </h4>
        <EaButton
          type="primary"
          size="small"
          @click="openScanModal"
        >
          <EaIcon
            name="scan"
            :size="14"
          />
          {{ t('settings.agentConfig.scanConfig') }}
        </EaButton>
      </div>
      <p class="cli-config-section__description">
        {{ t('settings.agentConfig.cliConfigDescription') }}
      </p>

      <!-- CLI 配置提示卡片 -->
      <div class="cli-config-card">
        <div class="cli-config-card__icon">
          <EaIcon
            name="info"
            :size="24"
          />
        </div>
        <div class="cli-config-card__content">
          <h5 class="cli-config-card__title">
            {{ t('settings.agentConfig.cliConfigCardTitle') }}
          </h5>
          <p class="cli-config-card__text">
            {{ t('settings.agentConfig.cliConfigCardText') }}
          </p>
        </div>
      </div>

      <!-- CLI 模型配置区域 -->
      <div class="cli-model-section">
        <div class="cli-model-section__header">
          <h4 class="cli-model-section__title">
            模型配置
          </h4>
          <EaButton
            type="secondary"
            size="small"
            @click="handleOpenModelManage"
          >
            <EaIcon
              name="settings"
              :size="14"
            />
            管理模型
          </EaButton>
        </div>
        <p class="cli-model-section__description">
          配置智能体可使用的模型列表。支持添加自定义模型和设置默认模型。
        </p>

        <div
          v-if="modelConfigs.length === 0"
          class="cli-model-section__empty"
        >
          <p class="cli-model-section__empty-text">
            暂无模型配置
          </p>
          <p class="cli-model-section__empty-hint">
            点击"管理模型"添加模型
          </p>
        </div>

        <div
          v-else
          class="cli-model-list"
        >
          <div
            v-for="config in modelConfigs"
            :key="config.id"
            class="cli-model-item"
            :class="{ 'cli-model-item--disabled': !config.enabled }"
          >
            <div class="cli-model-item__info">
              <span class="cli-model-item__name">{{ config.displayName }}</span>
              <span
                v-if="config.isDefault"
                class="cli-model-item__badge cli-model-item__badge--default"
              >
                默认
              </span>
              <span
                v-if="config.isBuiltin"
                class="cli-model-item__badge cli-model-item__badge--builtin"
              >
                内置
              </span>
            </div>
            <div class="cli-model-item__id">
              {{ config.modelId || '使用默认模型' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SDK 类型智能体：Tab 切换 MCP/Skills/Plugins -->
    <div
      v-else-if="isSdkAgent"
      class="config-panel"
    >
      <!-- Tab 导航 -->
      <div class="config-panel__tabs">
        <button
          class="config-panel__tab"
          :class="{ 'config-panel__tab--active': activeTab === 'mcp' }"
          @click="activeTab = 'mcp'"
        >
          <EaIcon
            name="server"
            :size="16"
          />
          MCP
          <span
            v-if="mcpConfigs.length > 0"
            class="config-panel__tab-count"
          >
            {{ mcpConfigs.length }}
          </span>
        </button>
        <button
          class="config-panel__tab"
          :class="{ 'config-panel__tab--active': activeTab === 'skills' }"
          @click="activeTab = 'skills'"
        >
          <EaIcon
            name="book-open"
            :size="16"
          />
          Skills
          <span
            v-if="skillsConfigs.length > 0"
            class="config-panel__tab-count"
          >
            {{ skillsConfigs.length }}
          </span>
        </button>
        <button
          class="config-panel__tab"
          :class="{ 'config-panel__tab--active': activeTab === 'plugins' }"
          @click="activeTab = 'plugins'"
        >
          <EaIcon
            name="puzzle"
            :size="16"
          />
          Plugins
          <span
            v-if="pluginsConfigs.length > 0"
            class="config-panel__tab-count"
          >
            {{ pluginsConfigs.length }}
          </span>
        </button>
        <button
          class="config-panel__tab"
          :class="{ 'config-panel__tab--active': activeTab === 'models' }"
          @click="activeTab = 'models'"
        >
          <EaIcon
            name="cpu"
            :size="16"
          />
          模型
        </button>
      </div>

      <!-- Tab 内容区域 -->
      <div class="config-panel__content">
        <!-- MCP 配置列表 -->
        <div
          v-if="activeTab === 'mcp'"
          class="config-section"
        >
          <div class="config-section__header">
            <h4 class="config-section__title">
              {{ t('settings.sdkConfig.mcp.title') }}
            </h4>
            <EaButton
              type="secondary"
              size="small"
              @click="handleAddMcp"
            >
              <EaIcon
                name="plus"
                :size="14"
              />
              {{ t('common.create') }}
            </EaButton>
          </div>

          <div
            v-if="mcpConfigs.length === 0"
            class="config-section__empty"
          >
            <p class="config-section__empty-text">
              {{ t('settings.sdkConfig.mcp.noConfigs') }}
            </p>
          </div>

          <div
            v-else
            class="config-list"
          >
            <div
              v-for="config in mcpConfigs"
              :key="config.id"
              class="config-item"
              :class="{ 'config-item--disabled': !config.enabled }"
            >
              <div class="config-item__header">
                <span class="config-item__name">{{ config.name }}</span>
                <span
                  class="config-item__badge"
                  :style="{ backgroundColor: getTransportTypeColor(config.transportType) }"
                >
                  {{ config.transportType.toUpperCase() }}
                </span>
              </div>
              <div
                v-if="config.command"
                class="config-item__detail"
              >
                <span class="config-item__label">Command:</span>
                <span class="config-item__value">{{ config.command }}</span>
              </div>
              <div
                v-if="config.url"
                class="config-item__detail"
              >
                <span class="config-item__label">URL:</span>
                <span class="config-item__value">{{ config.url }}</span>
              </div>
              <div class="config-item__actions">
                <button
                  class="config-item__action"
                  :title="config.enabled ? t('settings.sdkConfig.disable') : t('settings.sdkConfig.enable')"
                  @click="handleToggleMcp(config)"
                >
                  <EaIcon
                    :name="config.enabled ? 'toggle-right' : 'toggle-left'"
                    :size="16"
                  />
                </button>
                <button
                  class="config-item__action"
                  :title="t('common.edit')"
                  @click="handleEditMcp(config)"
                >
                  <EaIcon
                    name="edit-2"
                    :size="14"
                  />
                </button>
                <button
                  class="config-item__action config-item__action--danger"
                  :title="t('common.delete')"
                  @click="handleDeleteMcp(config.id)"
                >
                  <EaIcon
                    name="trash-2"
                    :size="14"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Skills 配置列表 -->
        <div
          v-if="activeTab === 'skills'"
          class="config-section"
        >
          <div class="config-section__header">
            <h4 class="config-section__title">
              {{ t('settings.sdkConfig.skills.title') }}
            </h4>
            <EaButton
              type="secondary"
              size="small"
              @click="handleAddSkills"
            >
              <EaIcon
                name="plus"
                :size="14"
              />
              {{ t('common.create') }}
            </EaButton>
          </div>

          <div
            v-if="skillsConfigs.length === 0"
            class="config-section__empty"
          >
            <p class="config-section__empty-text">
              {{ t('settings.sdkConfig.skills.noConfigs') }}
            </p>
          </div>

          <div
            v-else
            class="config-list"
          >
            <div
              v-for="config in skillsConfigs"
              :key="config.id"
              class="config-item"
              :class="{ 'config-item--disabled': !config.enabled }"
            >
              <div class="config-item__header">
                <span class="config-item__name">{{ config.name }}</span>
              </div>
              <div
                v-if="config.description"
                class="config-item__description"
              >
                {{ config.description }}
              </div>
              <div class="config-item__detail">
                <span class="config-item__label">Path:</span>
                <span class="config-item__value">{{ config.skillPath }}</span>
              </div>
              <div class="config-item__actions">
                <button
                  class="config-item__action"
                  :title="config.enabled ? t('settings.sdkConfig.disable') : t('settings.sdkConfig.enable')"
                  @click="handleToggleSkills(config)"
                >
                  <EaIcon
                    :name="config.enabled ? 'toggle-right' : 'toggle-left'"
                    :size="16"
                  />
                </button>
                <button
                  class="config-item__action"
                  :title="t('common.edit')"
                  @click="handleEditSkills(config)"
                >
                  <EaIcon
                    name="edit-2"
                    :size="14"
                  />
                </button>
                <button
                  class="config-item__action config-item__action--danger"
                  :title="t('common.delete')"
                  @click="handleDeleteSkills(config.id)"
                >
                  <EaIcon
                    name="trash-2"
                    :size="14"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Plugins 配置列表 -->
        <div
          v-if="activeTab === 'plugins'"
          class="config-section"
        >
          <div class="config-section__header">
            <h4 class="config-section__title">
              {{ t('settings.sdkConfig.plugins.title') }}
            </h4>
            <EaButton
              type="secondary"
              size="small"
              @click="handleAddPlugins"
            >
              <EaIcon
                name="plus"
                :size="14"
              />
              {{ t('common.create') }}
            </EaButton>
          </div>

          <div
            v-if="pluginsConfigs.length === 0"
            class="config-section__empty"
          >
            <p class="config-section__empty-text">
              {{ t('settings.sdkConfig.plugins.noConfigs') }}
            </p>
          </div>

          <div
            v-else
            class="config-list"
          >
            <div
              v-for="config in pluginsConfigs"
              :key="config.id"
              class="config-item"
              :class="{ 'config-item--disabled': !config.enabled }"
            >
              <div class="config-item__header">
                <span class="config-item__name">{{ config.name }}</span>
                <span
                  v-if="config.version"
                  class="config-item__version"
                >
                  v{{ config.version }}
                </span>
              </div>
              <div
                v-if="config.description"
                class="config-item__description"
              >
                {{ config.description }}
              </div>
              <div class="config-item__detail">
                <span class="config-item__label">Path:</span>
                <span class="config-item__value">{{ config.pluginPath }}</span>
              </div>
              <div class="config-item__actions">
                <button
                  class="config-item__action"
                  :title="config.enabled ? t('settings.sdkConfig.disable') : t('settings.sdkConfig.enable')"
                  @click="handleTogglePlugins(config)"
                >
                  <EaIcon
                    :name="config.enabled ? 'toggle-right' : 'toggle-left'"
                    :size="16"
                  />
                </button>
                <button
                  class="config-item__action"
                  :title="t('common.edit')"
                  @click="handleEditPlugins(config)"
                >
                  <EaIcon
                    name="edit-2"
                    :size="14"
                  />
                </button>
                <button
                  class="config-item__action config-item__action--danger"
                  :title="t('common.delete')"
                  @click="handleDeletePlugins(config.id)"
                >
                  <EaIcon
                    name="trash-2"
                    :size="14"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型管理 -->
        <div
          v-if="activeTab === 'models'"
          class="config-section"
        >
          <div class="config-section__header">
            <h4 class="config-section__title">
              模型配置
            </h4>
            <EaButton
              type="secondary"
              size="small"
              @click="handleOpenModelManage"
            >
              <EaIcon
                name="settings"
                :size="14"
              />
              管理模型
            </EaButton>
          </div>

          <div class="config-section__description">
            <p>配置智能体可使用的模型列表。支持添加自定义模型和设置默认模型。</p>
          </div>

          <div
            v-if="modelConfigs.length === 0"
            class="config-section__empty"
          >
            <p class="config-section__empty-text">
              暂无模型配置
            </p>
            <p class="config-section__empty-hint">
              点击"管理模型"添加模型
            </p>
          </div>

          <div
            v-else
            class="config-list"
          >
            <div
              v-for="config in modelConfigs"
              :key="config.id"
              class="config-item"
              :class="{ 'config-item--disabled': !config.enabled }"
            >
              <div class="config-item__header">
                <span class="config-item__name">{{ config.displayName }}</span>
                <span
                  v-if="config.isDefault"
                  class="config-item__badge config-item__badge--default"
                >
                  默认
                </span>
                <span
                  v-if="config.isBuiltin"
                  class="config-item__badge config-item__badge--builtin"
                >
                  内置
                </span>
              </div>
              <div class="config-item__detail">
                <span class="config-item__label">Model ID:</span>
                <span class="config-item__value">{{ config.modelId || '使用默认模型' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MCP 配置弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showMcpModal"
          class="modal-overlay"
          @click="showMcpModal = false"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <div class="modal-form">
              <div class="modal-form__header">
                <h3 class="modal-form__title">
                  {{ editingMcpConfig ? t('settings.sdkConfig.mcp.edit') : t('settings.sdkConfig.mcp.add') }}
                </h3>
              </div>
              <div class="modal-form__body">
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.sdkConfig.mcp.name') }} <span class="form-label__required">*</span>
                  </label>
                  <input
                    v-model="mcpForm.name"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.mcp.namePlaceholder')"
                  >
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">{{ t('settings.sdkConfig.mcp.transportType') }}</label>
                    <select
                      v-model="mcpForm.transportType"
                      class="form-select"
                    >
                      <option
                        v-for="opt in transportTypeOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">{{ t('settings.sdkConfig.mcp.scope') }}</label>
                    <select
                      v-model="mcpForm.scope"
                      class="form-select"
                    >
                      <option
                        v-for="opt in scopeOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                  </div>
                </div>
                <div
                  v-if="mcpForm.transportType === 'stdio'"
                  class="form-group"
                >
                  <label class="form-label">{{ t('settings.sdkConfig.mcp.command') }}</label>
                  <input
                    v-model="mcpForm.command"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.mcp.commandPlaceholder')"
                  >
                </div>
                <div
                  v-if="mcpForm.transportType === 'stdio'"
                  class="form-group"
                >
                  <label class="form-label">{{ t('settings.sdkConfig.mcp.args') }}</label>
                  <input
                    v-model="mcpForm.args"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.mcp.argsPlaceholder')"
                  >
                </div>
                <div
                  v-if="['sse', 'http'].includes(mcpForm.transportType)"
                  class="form-group"
                >
                  <label class="form-label">URL</label>
                  <input
                    v-model="mcpForm.url"
                    type="text"
                    class="form-input"
                    placeholder="https://api.example.com"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.mcp.env') }}</label>
                  <textarea
                    v-model="mcpForm.env"
                    class="form-textarea"
                    rows="3"
                    :placeholder="t('settings.sdkConfig.mcp.envPlaceholder')"
                  />
                </div>
              </div>
              <div class="modal-form__actions">
                <EaButton
                  type="secondary"
                  @click="showMcpModal = false"
                >
                  {{ t('common.cancel') }}
                </EaButton>
                <EaButton
                  type="primary"
                  :disabled="!mcpForm.name.trim()"
                  @click="handleSaveMcp"
                >
                  {{ editingMcpConfig ? t('common.save') : t('common.create') }}
                </EaButton>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Skills 配置弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showSkillsModal"
          class="modal-overlay"
          @click="showSkillsModal = false"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <div class="modal-form">
              <div class="modal-form__header">
                <h3 class="modal-form__title">
                  {{ editingSkillsConfig ? t('settings.sdkConfig.skills.edit') : t('settings.sdkConfig.skills.add') }}
                </h3>
              </div>
              <div class="modal-form__body">
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.sdkConfig.skills.name') }} <span class="form-label__required">*</span>
                  </label>
                  <input
                    v-model="skillsForm.name"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.skills.namePlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.skills.description') }}</label>
                  <input
                    v-model="skillsForm.description"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.skills.descriptionPlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.sdkConfig.skills.path') }} <span class="form-label__required">*</span>
                  </label>
                  <input
                    v-model="skillsForm.skillPath"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.skills.pathPlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.skills.scriptsPath') }}</label>
                  <input
                    v-model="skillsForm.scriptsPath"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.skills.scriptsPathPlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.skills.referencesPath') }}</label>
                  <input
                    v-model="skillsForm.referencesPath"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.skills.referencesPathPlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.skills.assetsPath') }}</label>
                  <input
                    v-model="skillsForm.assetsPath"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.skills.assetsPathPlaceholder')"
                  >
                </div>
              </div>
              <div class="modal-form__actions">
                <EaButton
                  type="secondary"
                  @click="showSkillsModal = false"
                >
                  {{ t('common.cancel') }}
                </EaButton>
                <EaButton
                  type="primary"
                  :disabled="!skillsForm.name.trim() || !skillsForm.skillPath.trim()"
                  @click="handleSaveSkills"
                >
                  {{ editingSkillsConfig ? t('common.save') : t('common.create') }}
                </EaButton>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Plugins 配置弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showPluginsModal"
          class="modal-overlay"
          @click="showPluginsModal = false"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <div class="modal-form">
              <div class="modal-form__header">
                <h3 class="modal-form__title">
                  {{ editingPluginsConfig ? t('settings.sdkConfig.plugins.edit') : t('settings.sdkConfig.plugins.add') }}
                </h3>
              </div>
              <div class="modal-form__body">
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.sdkConfig.plugins.name') }} <span class="form-label__required">*</span>
                  </label>
                  <input
                    v-model="pluginsForm.name"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.plugins.namePlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.plugins.version') }}</label>
                  <input
                    v-model="pluginsForm.version"
                    type="text"
                    class="form-input"
                    placeholder="1.0.0"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">{{ t('settings.sdkConfig.plugins.description') }}</label>
                  <input
                    v-model="pluginsForm.description"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.plugins.descriptionPlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.sdkConfig.plugins.path') }} <span class="form-label__required">*</span>
                  </label>
                  <input
                    v-model="pluginsForm.pluginPath"
                    type="text"
                    class="form-input"
                    :placeholder="t('settings.sdkConfig.plugins.pathPlaceholder')"
                  >
                </div>
              </div>
              <div class="modal-form__actions">
                <EaButton
                  type="secondary"
                  @click="showPluginsModal = false"
                >
                  {{ t('common.cancel') }}
                </EaButton>
                <EaButton
                  type="primary"
                  :disabled="!pluginsForm.name.trim() || !pluginsForm.pluginPath.trim()"
                  @click="handleSavePlugins"
                >
                  {{ editingPluginsConfig ? t('common.save') : t('common.create') }}
                </EaButton>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteConfirm"
          class="modal-overlay"
          @click="showDeleteConfirm = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('common.confirmDelete') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('settings.sdkConfig.confirmDeleteMessage') }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="showDeleteConfirm = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                @click="confirmDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 扫描弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showScanModal"
          class="modal-overlay"
          @click="closeScanModal"
        >
          <div
            class="modal-scan-container"
            @click.stop
          >
            <ClaudeConfigScanModal @close="closeScanModal" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 模型管理弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModelManageModal && selectedAgentId"
          class="modal-overlay"
          @click="showModelManageModal = false"
        >
          <div
            class="modal-container modal-container--lg"
            @click.stop
          >
            <ModelManageModal
              :agent-id="selectedAgentId"
              @close="handleCloseModelManage"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.agent-config-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--spacing-4);
}

/* 顶部区域 */
.agent-config-page__header {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.agent-config-page__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-4);
}

.agent-config-page__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.agent-config-page__description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 智能体选择器 */
.agent-selector {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.agent-selector__wrapper {
  position: relative;
  min-width: 240px;
}

.agent-selector__prefix-icon {
  position: absolute;
  left: var(--spacing-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.agent-selector__select {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-10) var(--spacing-2) var(--spacing-9);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  appearance: none;
  transition: border-color var(--transition-fast) var(--easing-default);
}

.agent-selector__select:hover {
  border-color: var(--color-border-dark);
}

.agent-selector__select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.agent-selector__select--placeholder {
  color: var(--color-text-tertiary);
}

.agent-selector__icon {
  position: absolute;
  right: var(--spacing-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.agent-selector__select optgroup {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.agent-selector__select option {
  font-weight: var(--font-weight-normal);
  color: var(--color-text-primary);
  padding: var(--spacing-2);
}

.agent-selector__info {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.agent-selector__type-badge {
  padding: 2px var(--spacing-2);
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  font-size: 10px;
}

.agent-selector__type-badge--sdk {
  background-color: var(--color-success-light, rgba(34, 197, 94, 0.1));
  color: var(--color-success, #22c55e);
}

.agent-selector__type-badge--cli {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.agent-selector__source {
  color: var(--color-text-tertiary);
}

/* 空状态 */
.config-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: var(--spacing-10) var(--spacing-4);
  text-align: center;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-border);
}

.config-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
}

.config-empty__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.config-empty__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* CLI 配置区域 */
.cli-config-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.cli-config-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cli-config-section__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.cli-config-section__description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.cli-config-card {
  display: flex;
  gap: var(--spacing-4);
  padding: var(--spacing-4);
  background-color: var(--color-info-light, rgba(96, 165, 250, 0.1));
  border: 1px solid var(--color-info, #60a5fa);
  border-radius: var(--radius-lg);
}

.cli-config-card__icon {
  flex-shrink: 0;
  color: var(--color-info, #60a5fa);
}

.cli-config-card__content {
  flex: 1;
}

.cli-config-card__title {
  margin: 0 0 var(--spacing-1);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.cli-config-card__text {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* CLI 模型配置区域 */
.cli-model-section {
  margin-top: var(--spacing-6);
  padding-top: var(--spacing-6);
  border-top: 1px solid var(--color-border);
}

.cli-model-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-3);
}

.cli-model-section__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.cli-model-section__description {
  margin: 0 0 var(--spacing-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.cli-model-section__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-6);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  text-align: center;
}

.cli-model-section__empty-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.cli-model-section__empty-hint {
  margin: var(--spacing-2) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.cli-model-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.cli-model-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  padding: var(--spacing-3) var(--spacing-4);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.cli-model-item:hover {
  background-color: var(--color-surface-hover);
}

.cli-model-item--disabled {
  opacity: 0.6;
}

.cli-model-item__info {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.cli-model-item__name {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.cli-model-item__badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-medium);
}

.cli-model-item__badge--default {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.cli-model-item__badge--builtin {
  background-color: var(--color-info-light);
  color: var(--color-info);
}

.cli-model-item__id {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: monospace;
}

/* 配置面板 */
.config-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background-color: var(--color-bg-secondary);
}

.config-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
  padding: 0 var(--spacing-2);
}

.config-panel__tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.config-panel__tab:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
}

.config-panel__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background-color: var(--color-bg-secondary);
}

.config-panel__tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 var(--spacing-1);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
}

.config-panel__content {
  flex: 1;
  padding: var(--spacing-4);
  overflow-y: auto;
  background-color: var(--color-bg-secondary);
}

/* 配置区块 */
.config-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.config-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-section__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.config-section__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
}

.config-section__empty-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 配置列表 */
.config-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.config-item {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast);
}

.config-item:hover {
  border-color: var(--color-border-dark);
}

.config-item--disabled {
  opacity: 0.6;
}

.config-item__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.config-item__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.config-item__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: white;
}

.config-item__version {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.config-item__description {
  margin-top: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.config-item__detail {
  display: flex;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  font-size: var(--font-size-xs);
}

.config-item__label {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.config-item__value {
  color: var(--color-text-secondary);
  word-break: break-all;
}

.config-item__actions {
  display: flex;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  padding-top: var(--spacing-2);
  border-top: 1px solid var(--color-border);
}

.config-item__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-item__action:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.config-item__action--danger:hover {
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  border-color: var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
}

/* 弹框样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 480px;
  max-width: 90vw;
  max-height: 90vh;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
}

.modal-form {
  display: flex;
  flex-direction: column;
}

.modal-form__header {
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.modal-form__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.modal-form__body {
  flex: 1;
  padding: var(--spacing-5);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.modal-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-row {
  display: flex;
  gap: var(--spacing-4);
}

.form-row .form-group {
  flex: 1;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.form-label__required {
  color: var(--color-error, #ef4444);
  margin-left: 2px;
}

.form-input,
.form-select,
.form-textarea {
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast) var(--easing-default);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--color-primary);
  outline: none;
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.confirm-dialog {
  width: 400px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.modal-scan-container {
  max-width: 90vw;
  max-height: 90vh;
  background-color: transparent;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.confirm-dialog__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-6);
  text-align: center;
}

.confirm-dialog__icon {
  color: var(--color-warning);
  margin-bottom: var(--spacing-4);
}

.confirm-dialog__title {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.confirm-dialog__message {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--color-border);
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-active .modal-container,
.modal-enter-active .confirm-dialog,
.modal-enter-active .modal-scan-container,
.modal-leave-active .modal-container,
.modal-leave-active .confirm-dialog,
.modal-leave-active .modal-scan-container {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-enter-from .confirm-dialog,
.modal-enter-from .modal-scan-container,
.modal-leave-to .modal-container,
.modal-leave-to .confirm-dialog,
.modal-leave-to .modal-scan-container {
  transform: scale(0.95);
  opacity: 0;
}
</style>
