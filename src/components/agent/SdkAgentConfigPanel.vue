<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useAgentConfigStore,
  type AgentMcpConfig,
  type AgentSkillsConfig,
  type AgentPluginsConfig,
  type McpTransportType,
  type McpConfigScope
} from '@/stores/agentConfig'
import { EaButton, EaIcon } from '@/components/common'

const props = defineProps<{
  agentId: string
}>()

const { t } = useI18n()
const agentConfigStore = useAgentConfigStore()

// 当前标签页
const activeTab = ref<'mcp' | 'skills' | 'plugins'>('mcp')

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

// 计算属性
const mcpConfigs = computed(() => agentConfigStore.getMcpConfigs(props.agentId))
const skillsConfigs = computed(() => agentConfigStore.getSkillsConfigs(props.agentId))
const pluginsConfigs = computed(() => agentConfigStore.getPluginsConfigs(props.agentId))

// 加载配置
onMounted(async () => {
  await agentConfigStore.loadAllConfigs(props.agentId)
})

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
  if (!mcpForm.value.name.trim()) return

  if (editingMcpConfig.value) {
    await agentConfigStore.updateMcpConfig(editingMcpConfig.value.id, props.agentId, {
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
      agentId: props.agentId,
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
  await agentConfigStore.updateMcpConfig(config.id, props.agentId, {
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
  if (!skillsForm.value.name.trim() || !skillsForm.value.skillPath.trim()) return

  if (editingSkillsConfig.value) {
    await agentConfigStore.updateSkillsConfig(editingSkillsConfig.value.id, props.agentId, {
      name: skillsForm.value.name,
      description: skillsForm.value.description || undefined,
      skillPath: skillsForm.value.skillPath,
      scriptsPath: skillsForm.value.scriptsPath || undefined,
      referencesPath: skillsForm.value.referencesPath || undefined,
      assetsPath: skillsForm.value.assetsPath || undefined
    })
  } else {
    await agentConfigStore.createSkillsConfig({
      agentId: props.agentId,
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
  await agentConfigStore.updateSkillsConfig(config.id, props.agentId, {
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
  if (!pluginsForm.value.name.trim() || !pluginsForm.value.pluginPath.trim()) return

  if (editingPluginsConfig.value) {
    await agentConfigStore.updatePluginsConfig(editingPluginsConfig.value.id, props.agentId, {
      name: pluginsForm.value.name,
      version: pluginsForm.value.version || undefined,
      description: pluginsForm.value.description || undefined,
      pluginPath: pluginsForm.value.pluginPath
    })
  } else {
    await agentConfigStore.createPluginsConfig({
      agentId: props.agentId,
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
  await agentConfigStore.updatePluginsConfig(config.id, props.agentId, {
    enabled: !config.enabled
  })
}

const handleDeletePlugins = (id: string) => {
  deletingConfig.value = { type: 'plugins', id }
  showDeleteConfirm.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!deletingConfig.value) return

  switch (deletingConfig.value.type) {
    case 'mcp':
      await agentConfigStore.deleteMcpConfig(deletingConfig.value.id, props.agentId)
      break
    case 'skills':
      await agentConfigStore.deleteSkillsConfig(deletingConfig.value.id, props.agentId)
      break
    case 'plugins':
      await agentConfigStore.deletePluginsConfig(deletingConfig.value.id, props.agentId)
      break
  }
  showDeleteConfirm.value = false
  deletingConfig.value = null
}

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

// 获取传输类型标签颜色
const getTransportTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    stdio: 'var(--color-primary)',
    sse: 'var(--color-success)',
    http: 'var(--color-info, #3b82f6)'
  }
  return colors[type] || 'var(--color-text-secondary)'
}
</script>

<template>
  <div class="sdk-config-panel">
    <!-- 标签页切换 -->
    <div class="sdk-config-panel__tabs">
      <button
        class="sdk-config-panel__tab"
        :class="{ 'sdk-config-panel__tab--active': activeTab === 'mcp' }"
        @click="activeTab = 'mcp'"
      >
        <EaIcon
          name="server"
          :size="16"
        />
        MCP
        <span
          v-if="mcpConfigs.length > 0"
          class="sdk-config-panel__tab-count"
        >
          {{ mcpConfigs.length }}
        </span>
      </button>
      <button
        class="sdk-config-panel__tab"
        :class="{ 'sdk-config-panel__tab--active': activeTab === 'skills' }"
        @click="activeTab = 'skills'"
      >
        <EaIcon
          name="book-open"
          :size="16"
        />
        Skills
        <span
          v-if="skillsConfigs.length > 0"
          class="sdk-config-panel__tab-count"
        >
          {{ skillsConfigs.length }}
        </span>
      </button>
      <button
        class="sdk-config-panel__tab"
        :class="{ 'sdk-config-panel__tab--active': activeTab === 'plugins' }"
        @click="activeTab = 'plugins'"
      >
        <EaIcon
          name="puzzle"
          :size="16"
        />
        Plugins
        <span
          v-if="pluginsConfigs.length > 0"
          class="sdk-config-panel__tab-count"
        >
          {{ pluginsConfigs.length }}
        </span>
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="sdk-config-panel__content">
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
          class="config-empty"
        >
          <p class="config-empty__text">
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
          class="config-empty"
        >
          <p class="config-empty__text">
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
          class="config-empty"
        >
          <p class="config-empty__text">
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
  </div>
</template>

<style scoped>
.sdk-config-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.sdk-config-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg-secondary);
}

.sdk-config-panel__tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.sdk-config-panel__tab:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
}

.sdk-config-panel__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.sdk-config-panel__tab-count {
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

.sdk-config-panel__content {
  flex: 1;
  padding: var(--spacing-4);
  overflow-y: auto;
}

.config-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-4);
}

.config-section__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.config-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
}

.config-empty__text {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.config-item {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
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
  background-color: var(--color-bg-tertiary);
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
.modal-leave-active .modal-container,
.modal-leave-active .confirm-dialog {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-enter-from .confirm-dialog,
.modal-leave-to .modal-container,
.modal-leave-to .confirm-dialog {
  transform: scale(0.95);
  opacity: 0;
}
</style>
