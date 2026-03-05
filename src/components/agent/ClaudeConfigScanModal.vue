<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { EaButton, EaIcon } from '@/components/common'

export interface ScannedMcpServer {
  name: string
  transport: 'stdio' | 'sse' | 'http'
  scope: 'user' | 'local' | 'project'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface SkillSubdirectories {
  has_scripts: boolean
  has_references: boolean
  has_assets: boolean
}

export interface ScannedSkill {
  name: string
  path: string
  description?: string
  frontmatter_name?: string
  subdirectories: SkillSubdirectories
}

export interface PluginSubdirectories {
  has_agents: boolean
  has_commands: boolean
  has_skills: boolean
  has_hooks: boolean
  has_scripts: boolean
}

export interface ScannedPlugin {
  name: string
  path: string
  enabled: boolean
  version?: string
  description?: string
  author?: string
  subdirectories: PluginSubdirectories
}

export interface ClaudeConfigScanResult {
  claude_dir: string
  mcp_servers: ScannedMcpServer[]
  skills: ScannedSkill[]
  plugins: ScannedPlugin[]
  scan_success: boolean
  error_message?: string
}

export interface SelectedItems {
  mcpServers: string[]
  skills: string[]
  plugins: string[]
}

const emit = defineEmits<{
  close: []
  import: [items: SelectedItems]
}>()

const { t } = useI18n()

const isScanning = ref(false)
const scanResult = ref<ClaudeConfigScanResult | null>(null)
const scanError = ref('')

// 选中的项目
const selectedMcpServers = ref<string[]>([])
const selectedSkills = ref<string[]>([])
const selectedPlugins = ref<string[]>([])

// 当前标签页
const activeTab = ref<'mcp' | 'skills' | 'plugins'>('mcp')

// 计算选中的总数
const selectedCount = computed(() => {
  return selectedMcpServers.value.length + selectedSkills.value.length + selectedPlugins.value.length
})

// 是否可以导入
const canImport = computed(() => selectedCount.value > 0)

// 扫描配置
const scanConfig = async () => {
  isScanning.value = true
  scanError.value = ''
  scanResult.value = null

  try {
    const result = await invoke<ClaudeConfigScanResult>('scan_claude_config')
    scanResult.value = result

    if (!result.scan_success && result.error_message) {
      scanError.value = result.error_message
    }
  } catch (error) {
    scanError.value = String(error)
  } finally {
    isScanning.value = false
  }
}

// 全选/取消全选 MCP
const toggleAllMcp = () => {
  if (!scanResult.value) return

  if (selectedMcpServers.value.length === scanResult.value.mcp_servers.length) {
    selectedMcpServers.value = []
  } else {
    selectedMcpServers.value = scanResult.value.mcp_servers.map(s => s.name)
  }
}

// 全选/取消全选 Skills
const toggleAllSkills = () => {
  if (!scanResult.value) return

  if (selectedSkills.value.length === scanResult.value.skills.length) {
    selectedSkills.value = []
  } else {
    selectedSkills.value = scanResult.value.skills.map(s => s.name)
  }
}

// 全选/取消全选 Plugins
const toggleAllPlugins = () => {
  if (!scanResult.value) return

  if (selectedPlugins.value.length === scanResult.value.plugins.length) {
    selectedPlugins.value = []
  } else {
    selectedPlugins.value = scanResult.value.plugins.map(s => s.name)
  }
}

// 处理导入
const handleImport = () => {
  emit('import', {
    mcpServers: selectedMcpServers.value,
    skills: selectedSkills.value,
    plugins: selectedPlugins.value
  })
}

// 关闭弹窗
const handleClose = () => {
  emit('close')
}

// 切换 MCP 选中状态
const toggleMcpServer = (name: string) => {
  const index = selectedMcpServers.value.indexOf(name)
  if (index === -1) {
    selectedMcpServers.value.push(name)
  } else {
    selectedMcpServers.value.splice(index, 1)
  }
}

// 切换 Skill 选中状态
const toggleSkill = (name: string) => {
  const index = selectedSkills.value.indexOf(name)
  if (index === -1) {
    selectedSkills.value.push(name)
  } else {
    selectedSkills.value.splice(index, 1)
  }
}

// 切换 Plugin 选中状态
const togglePlugin = (name: string) => {
  const index = selectedPlugins.value.indexOf(name)
  if (index === -1) {
    selectedPlugins.value.push(name)
  } else {
    selectedPlugins.value.splice(index, 1)
  }
}

// 组件挂载时自动扫描
watch(() => true, () => {
  scanConfig()
}, { immediate: true })
</script>

<template>
  <div class="scan-modal">
    <div class="scan-modal__header">
      <h3 class="scan-modal__title">
        {{ t('settings.agent.scan.title') }}
      </h3>
      <button
        class="scan-modal__close"
        @click="handleClose"
      >
        <EaIcon
          name="close"
          :size="18"
        />
      </button>
    </div>

    <div class="scan-modal__body">
      <!-- 扫描中状态 -->
      <div
        v-if="isScanning"
        class="scan-modal__loading"
      >
        <EaIcon
          name="loader"
          :size="24"
          spin
        />
        <span>{{ t('settings.agent.scan.scanning') }}</span>
      </div>

      <!-- 扫描错误 -->
      <div
        v-else-if="scanError"
        class="scan-modal__error"
      >
        <EaIcon
          name="alert-circle"
          :size="24"
        />
        <span>{{ scanError }}</span>
        <EaButton
          type="secondary"
          @click="scanConfig"
        >
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <!-- 扫描结果 -->
      <template v-else-if="scanResult">
        <!-- 扫描目录信息 -->
        <div class="scan-modal__info">
          <EaIcon
            name="folder"
            :size="16"
          />
          <span>{{ scanResult.claude_dir }}</span>
        </div>

        <!-- 标签页 -->
        <div class="scan-modal__tabs">
          <button
            class="scan-tab"
            :class="{ 'scan-tab--active': activeTab === 'mcp' }"
            @click="activeTab = 'mcp'"
          >
            <span>MCP</span>
            <span
              v-if="scanResult.mcp_servers.length > 0"
              class="scan-tab__count"
            >
              {{ scanResult.mcp_servers.length }}
            </span>
          </button>
          <button
            class="scan-tab"
            :class="{ 'scan-tab--active': activeTab === 'skills' }"
            @click="activeTab = 'skills'"
          >
            <span>Skills</span>
            <span
              v-if="scanResult.skills.length > 0"
              class="scan-tab__count"
            >
              {{ scanResult.skills.length }}
            </span>
          </button>
          <button
            class="scan-tab"
            :class="{ 'scan-tab--active': activeTab === 'plugins' }"
            @click="activeTab = 'plugins'"
          >
            <span>Plugins</span>
            <span
              v-if="scanResult.plugins.length > 0"
              class="scan-tab__count"
            >
              {{ scanResult.plugins.length }}
            </span>
          </button>
        </div>

        <!-- MCP 服务器列表 -->
        <div
          v-show="activeTab === 'mcp'"
          class="scan-modal__list"
        >
          <div
            v-if="scanResult.mcp_servers.length === 0"
            class="scan-modal__empty"
          >
            {{ t('settings.agent.scan.noMcpFound') }}
          </div>
          <template v-else>
            <div class="scan-modal__list-header">
              <label class="scan-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedMcpServers.length === scanResult.mcp_servers.length"
                  @change="toggleAllMcp"
                >
                <span>{{ t('settings.agent.scan.serverName') }}</span>
              </label>
              <span class="scan-modal__list-col scan-modal__list-col--small">{{ t('settings.agent.scan.transport') }}</span>
              <span class="scan-modal__list-col scan-modal__list-col--small">{{ t('settings.agent.scan.scope') }}</span>
              <span class="scan-modal__list-col">{{ t('settings.agent.scan.commandOrUrl') }}</span>
            </div>
            <div
              v-for="server in scanResult.mcp_servers"
              :key="server.name"
              class="scan-modal__list-item"
              :class="{ 'scan-modal__list-item--selected': selectedMcpServers.includes(server.name) }"
              @click="toggleMcpServer(server.name)"
            >
              <label class="scan-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedMcpServers.includes(server.name)"
                  @click.stop
                  @change="toggleMcpServer(server.name)"
                >
                <span class="scan-modal__item-name">{{ server.name }}</span>
              </label>
              <span class="scan-modal__list-col scan-modal__list-col--small">
                <span
                  class="scan-badge"
                  :class="`scan-badge--${server.transport}`"
                >
                  {{ server.transport.toUpperCase() }}
                </span>
              </span>
              <span class="scan-modal__list-col scan-modal__list-col--small">
                <span
                  class="scan-badge scan-badge--scope"
                  :class="`scan-badge--${server.scope}`"
                >
                  {{ t(`settings.agent.scan.scopeTypes.${server.scope}`) }}
                </span>
              </span>
              <span class="scan-modal__list-col scan-modal__item-command">
                <template v-if="server.transport === 'stdio'">
                  {{ server.command }}
                  <span
                    v-if="server.args && server.args.length > 0"
                    class="scan-modal__item-args"
                  >
                    {{ server.args.join(' ') }}
                  </span>
                </template>
                <template v-else>
                  {{ server.url }}
                </template>
              </span>
            </div>
          </template>
        </div>

        <!-- Skills 列表 -->
        <div
          v-show="activeTab === 'skills'"
          class="scan-modal__list"
        >
          <div
            v-if="scanResult.skills.length === 0"
            class="scan-modal__empty"
          >
            {{ t('settings.agent.scan.noSkillsFound') }}
          </div>
          <template v-else>
            <div class="scan-modal__list-header">
              <label class="scan-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedSkills.length === scanResult.skills.length"
                  @change="toggleAllSkills"
                >
                <span>{{ t('settings.agent.scan.skillName') }}</span>
              </label>
              <span class="scan-modal__list-col scan-modal__list-col--subdirs">{{ t('settings.agent.scan.subdirectories') }}</span>
              <span class="scan-modal__list-col">{{ t('settings.agent.scan.description') }}</span>
            </div>
            <div
              v-for="skill in scanResult.skills"
              :key="skill.name"
              class="scan-modal__list-item"
              :class="{ 'scan-modal__list-item--selected': selectedSkills.includes(skill.name) }"
              @click="toggleSkill(skill.name)"
            >
              <label class="scan-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedSkills.includes(skill.name)"
                  @click.stop
                  @change="toggleSkill(skill.name)"
                >
                <span class="scan-modal__item-name">{{ skill.name }}</span>
              </label>
              <span class="scan-modal__list-col scan-modal__list-col--subdirs">
                <span
                  v-if="skill.subdirectories.has_scripts"
                  class="scan-subdir-badge"
                  :title="t('settings.agent.scan.hasScripts')"
                >
                  scripts
                </span>
                <span
                  v-if="skill.subdirectories.has_references"
                  class="scan-subdir-badge scan-subdir-badge--refs"
                  :title="t('settings.agent.scan.hasReferences')"
                >
                  refs
                </span>
                <span
                  v-if="skill.subdirectories.has_assets"
                  class="scan-subdir-badge scan-subdir-badge--assets"
                  :title="t('settings.agent.scan.hasAssets')"
                >
                  assets
                </span>
                <span
                  v-if="!skill.subdirectories.has_scripts && !skill.subdirectories.has_references && !skill.subdirectories.has_assets"
                  class="scan-subdir-badge--empty"
                >
                  -
                </span>
              </span>
              <span class="scan-modal__list-col scan-modal__item-desc">
                {{ skill.description || '-' }}
              </span>
            </div>
          </template>
        </div>

        <!-- Plugins 列表 -->
        <div
          v-show="activeTab === 'plugins'"
          class="scan-modal__list"
        >
          <div
            v-if="scanResult.plugins.length === 0"
            class="scan-modal__empty"
          >
            {{ t('settings.agent.scan.noPluginsFound') }}
          </div>
          <template v-else>
            <div class="scan-modal__list-header">
              <label class="scan-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedPlugins.length === scanResult.plugins.length"
                  @change="toggleAllPlugins"
                >
                <span>{{ t('settings.agent.scan.pluginName') }}</span>
              </label>
              <span class="scan-modal__list-col scan-modal__list-col--small">{{ t('settings.agent.scan.version') }}</span>
              <span class="scan-modal__list-col scan-modal__list-col--subdirs">{{ t('settings.agent.scan.components') }}</span>
              <span class="scan-modal__list-col scan-modal__list-col--small">{{ t('settings.agent.scan.status') }}</span>
            </div>
            <div
              v-for="plugin in scanResult.plugins"
              :key="plugin.name"
              class="scan-modal__list-item"
              :class="{ 'scan-modal__list-item--selected': selectedPlugins.includes(plugin.name) }"
              @click="togglePlugin(plugin.name)"
            >
              <label class="scan-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedPlugins.includes(plugin.name)"
                  @click.stop
                  @change="togglePlugin(plugin.name)"
                >
                <span class="scan-modal__item-name">{{ plugin.name }}</span>
              </label>
              <span class="scan-modal__list-col scan-modal__list-col--small scan-modal__item-version">
                {{ plugin.version || '-' }}
              </span>
              <span class="scan-modal__list-col scan-modal__list-col--subdirs">
                <span
                  v-if="plugin.subdirectories.has_agents"
                  class="scan-plugin-badge"
                  :title="t('settings.agent.scan.hasAgents')"
                >
                  agents
                </span>
                <span
                  v-if="plugin.subdirectories.has_commands"
                  class="scan-plugin-badge scan-plugin-badge--commands"
                  :title="t('settings.agent.scan.hasCommands')"
                >
                  cmds
                </span>
                <span
                  v-if="plugin.subdirectories.has_skills"
                  class="scan-plugin-badge scan-plugin-badge--skills"
                  :title="t('settings.agent.scan.hasSkills')"
                >
                  skills
                </span>
                <span
                  v-if="plugin.subdirectories.has_hooks"
                  class="scan-plugin-badge scan-plugin-badge--hooks"
                  :title="t('settings.agent.scan.hasHooks')"
                >
                  hooks
                </span>
                <span
                  v-if="plugin.subdirectories.has_scripts"
                  class="scan-plugin-badge scan-plugin-badge--scripts"
                  :title="t('settings.agent.scan.hasScripts')"
                >
                  scripts
                </span>
                <span
                  v-if="!plugin.subdirectories.has_agents && !plugin.subdirectories.has_commands && !plugin.subdirectories.has_skills && !plugin.subdirectories.has_hooks && !plugin.subdirectories.has_scripts"
                  class="scan-subdir-badge--empty"
                >
                  -
                </span>
              </span>
              <span class="scan-modal__list-col scan-modal__list-col--small">
                <span
                  class="scan-status-badge"
                  :class="plugin.enabled ? 'scan-status-badge--enabled' : 'scan-status-badge--disabled'"
                >
                  {{ plugin.enabled ? t('settings.agent.scan.enabled') : t('settings.agent.scan.disabled') }}
                </span>
              </span>
            </div>
          </template>
        </div>
      </template>
    </div>

    <div class="scan-modal__footer">
      <span
        v-if="selectedCount > 0"
        class="scan-modal__selected-count"
      >
        {{ t('settings.agent.scan.selectedCount', { n: selectedCount }) }}
      </span>
      <span
        v-else
        class="scan-modal__selected-count scan-modal__selected-count--empty"
      >
        {{ t('settings.agent.scan.noSelection') }}
      </span>
      <div class="scan-modal__actions">
        <EaButton
          type="secondary"
          @click="handleClose"
        >
          {{ t('common.cancel') }}
        </EaButton>
        <EaButton
          type="primary"
          :disabled="!canImport"
          @click="handleImport"
        >
          {{ t('settings.agent.scan.importSelected') }}
        </EaButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan-modal {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  width: 560px;
  max-height: 80vh;
  overflow: hidden;
}

.scan-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.scan-modal__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.scan-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.scan-modal__close:hover {
  background-color: var(--color-hover);
  color: var(--color-text-primary);
}

.scan-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4) var(--spacing-5);
}

.scan-modal__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-8);
  color: var(--color-text-secondary);
}

.scan-modal__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-8);
  color: var(--color-error);
}

.scan-modal__info {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-background);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-4);
}

.scan-modal__tabs {
  display: flex;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-4);
}

.scan-tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.scan-tab:hover {
  background-color: var(--color-hover);
  color: var(--color-text-primary);
}

.scan-tab--active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.scan-tab__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--spacing-1);
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  font-size: var(--font-size-xs);
}

.scan-modal__list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.scan-modal__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-6);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.scan-modal__list-header {
  display: flex;
  align-items: center;
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.scan-modal__list-item {
  display: flex;
  align-items: center;
  padding: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.scan-modal__list-item:last-child {
  border-bottom: none;
}

.scan-modal__list-item:hover {
  background-color: var(--color-hover);
}

.scan-modal__list-item--selected {
  background-color: rgba(var(--color-primary-rgb), 0.1);
}

.scan-modal__list-col {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scan-modal__list-col--small {
  flex: 0 0 80px;
  text-align: center;
}

.scan-checkbox {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  cursor: pointer;
  min-width: 0;
  flex-shrink: 0;
  width: 40%;
}

.scan-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.scan-modal__item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.scan-modal__item-command {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.scan-modal__item-args {
  color: var(--color-text-tertiary);
}

.scan-modal__item-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.scan-status-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.scan-status-badge--enabled {
  background-color: rgba(34, 197, 94, 0.1);
  color: rgb(34, 197, 94);
}

.scan-status-badge--disabled {
  background-color: rgba(239, 68, 68, 0.1);
  color: rgb(239, 68, 68);
}

.scan-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  min-width: 50px;
}

.scan-badge--stdio {
  background-color: rgba(59, 130, 246, 0.1);
  color: rgb(59, 130, 246);
}

.scan-badge--sse {
  background-color: rgba(168, 85, 247, 0.1);
  color: rgb(168, 85, 247);
}

.scan-badge--http {
  background-color: rgba(34, 197, 94, 0.1);
  color: rgb(34, 197, 94);
}

.scan-badge--scope {
  background-color: rgba(100, 116, 139, 0.1);
  color: rgb(100, 116, 139);
}

.scan-badge--user {
  background-color: rgba(59, 130, 246, 0.1);
  color: rgb(59, 130, 246);
}

.scan-badge--local {
  background-color: rgba(251, 146, 60, 0.1);
  color: rgb(251, 146, 60);
}

.scan-badge--project {
  background-color: rgba(34, 197, 94, 0.1);
  color: rgb(34, 197, 94);
}

.scan-modal__list-col--subdirs {
  flex: 0 0 120px;
  display: flex;
  gap: var(--spacing-1);
  flex-wrap: wrap;
}

.scan-subdir-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  background-color: rgba(59, 130, 246, 0.1);
  color: rgb(59, 130, 246);
}

.scan-subdir-badge--refs {
  background-color: rgba(168, 85, 247, 0.1);
  color: rgb(168, 85, 247);
}

.scan-subdir-badge--assets {
  background-color: rgba(251, 146, 60, 0.1);
  color: rgb(251, 146, 60);
}

.scan-subdir-badge--empty {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.scan-plugin-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  background-color: rgba(34, 197, 94, 0.1);
  color: rgb(34, 197, 94);
}

.scan-plugin-badge--commands {
  background-color: rgba(59, 130, 246, 0.1);
  color: rgb(59, 130, 246);
}

.scan-plugin-badge--skills {
  background-color: rgba(168, 85, 247, 0.1);
  color: rgb(168, 85, 247);
}

.scan-plugin-badge--hooks {
  background-color: rgba(251, 146, 60, 0.1);
  color: rgb(251, 146, 60);
}

.scan-plugin-badge--scripts {
  background-color: rgba(236, 72, 153, 0.1);
  color: rgb(236, 72, 153);
}

.scan-modal__item-version {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.scan-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

.scan-modal__selected-count {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.scan-modal__selected-count--empty {
  color: var(--color-text-tertiary);
}

.scan-modal__actions {
  display: flex;
  gap: var(--spacing-3);
}
</style>
