<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig, AgentStatus, AgentProvider } from '@/stores/agent'
import { EaIcon, EaButton } from '@/components/common'
import SdkAgentConfigPanel from './SdkAgentConfigPanel.vue'

export interface AgentConfigCardProps {
  agent: AgentConfig
  isTesting?: boolean
}

const props = defineProps<AgentConfigCardProps>()
const { t } = useI18n()

const emit = defineEmits<{
  edit: [agent: AgentConfig]
  delete: [id: string]
  test: [id: string]
}>()

// SDK 配置面板展开状态
const showSdkConfig = ref(false)

const statusColor = computed(() => {
  const colors: Record<AgentStatus, string> = {
    online: 'var(--color-success)',
    offline: 'var(--color-text-tertiary)',
    error: 'var(--color-error)',
    testing: 'var(--color-warning)'
  }
  return colors[props.agent.status || 'offline']
})

const statusText = computed(() => {
  const texts: Record<AgentStatus, string> = {
    online: t('settings.agent.statusOnline'),
    offline: t('settings.agent.statusOffline'),
    error: t('settings.agent.statusError'),
    testing: t('settings.agent.statusTesting')
  }
  return texts[props.agent.status || 'offline']
})

// 根据 provider 显示图标
const providerIcon = computed(() => {
  const icons: Record<AgentProvider, string> = {
    claude: 'bot',
    codex: 'code'
  }
  return icons[props.agent.provider || 'claude']
})

// 根据 provider 显示文本
const providerText = computed(() => {
  const texts: Record<AgentProvider, string> = {
    claude: 'Claude',
    codex: 'Codex'
  }
  return texts[props.agent.provider || 'claude']
})

// 根据 type (cli/sdk) 显示模式文本
const typeText = computed(() => {
  return props.agent.type === 'cli' ? t('settings.agent.modeCli') : t('settings.agent.modeApi')
})

// 是否为 SDK 类型智能体
const isSdkAgent = computed(() => props.agent.type === 'sdk')

// 相对时间格式化
const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('common.justNow')
  if (minutes < 60) return t('common.minutesAgo', { n: minutes })
  if (hours < 24) return t('common.hoursAgo', { n: hours })
  return t('common.daysAgo', { n: days })
}

const createdAtText = computed(() => formatRelativeTime(props.agent.createdAt))
const updatedAtText = computed(() => formatRelativeTime(props.agent.updatedAt))

// 切换 SDK 配置面板
const toggleSdkConfig = () => {
  showSdkConfig.value = !showSdkConfig.value
}
</script>

<template>
  <div class="agent-card">
    <div class="agent-card__header">
      <div class="agent-card__icon">
        <EaIcon
          :name="providerIcon"
          :size="24"
        />
      </div>
      <div class="agent-card__info">
        <div class="agent-card__name">
          {{ agent.name }}
        </div>
        <div class="agent-card__meta">
          <span class="agent-card__type">{{ providerText }}</span>
          <span class="agent-card__separator">·</span>
          <span class="agent-card__mode">{{ typeText }}</span>
        </div>
      </div>
      <div class="agent-card__status">
        <span
          class="agent-card__status-dot"
          :style="{ backgroundColor: statusColor }"
        />
        <span class="agent-card__status-text">{{ statusText }}</span>
      </div>
    </div>

    <div
      v-if="agent.type === 'sdk' && agent.baseUrl"
      class="agent-card__detail"
    >
      <span class="agent-card__detail-label">{{ t('settings.agent.apiUrl') }}:</span>
      <span class="agent-card__detail-value">{{ agent.baseUrl }}</span>
    </div>

    <div
      v-if="agent.type === 'cli' && agent.cliPath"
      class="agent-card__detail"
    >
      <span class="agent-card__detail-label">{{ t('settings.agent.cliPath') }}:</span>
      <span class="agent-card__detail-value">{{ agent.cliPath }}</span>
    </div>

    <!-- 模型显示 -->
    <div
      v-if="agent.modelId"
      class="agent-card__detail"
    >
      <span class="agent-card__detail-label">{{ t('settings.agent.model') }}:</span>
      <span class="agent-card__detail-value">
        {{ agent.modelId }}
        <span
          v-if="agent.customModelEnabled"
          class="agent-card__custom-badge"
        >
          {{ t('settings.agent.customModel') }}
        </span>
      </span>
    </div>

    <!-- 时间信息 -->
    <div class="agent-card__time">
      <span class="agent-card__time-item">
        <EaIcon
          name="calendar"
          :size="12"
        />
        {{ t('settings.agent.createdAt') }}: {{ createdAtText }}
      </span>
      <span class="agent-card__time-separator">·</span>
      <span class="agent-card__time-item">
        <EaIcon
          name="clock"
          :size="12"
        />
        {{ t('settings.agent.updatedAt') }}: {{ updatedAtText }}
      </span>
    </div>

    <!-- SDK 配置管理按钮（仅 SDK 类型显示） -->
    <div
      v-if="isSdkAgent"
      class="agent-card__sdk-toggle"
    >
      <EaButton
        type="secondary"
        size="small"
        @click="toggleSdkConfig"
      >
        <EaIcon
          :name="showSdkConfig ? 'chevron-up' : 'chevron-down'"
          :size="14"
        />
        {{ showSdkConfig ? '收起配置' : '管理 MCP/Skills/Plugins' }}
      </EaButton>
    </div>

    <!-- SDK 配置面板（仅 SDK 类型且展开时显示） -->
    <div
      v-if="isSdkAgent && showSdkConfig"
      class="agent-card__sdk-config"
    >
      <SdkAgentConfigPanel :agent-id="agent.id" />
    </div>

    <div class="agent-card__actions">
      <EaButton
        type="ghost"
        size="small"
        :loading="isTesting"
        @click="emit('test', agent.id)"
      >
        <EaIcon
          name="wifi"
          :size="14"
        />
        {{ t('settings.agent.testConnection') }}
      </EaButton>
      <EaButton
        type="ghost"
        size="small"
        @click="emit('edit', agent)"
      >
        <EaIcon
          name="edit-2"
          :size="14"
        />
        {{ t('common.edit') }}
      </EaButton>
      <EaButton
        type="ghost"
        size="small"
        @click="emit('delete', agent.id)"
      >
        <EaIcon
          name="trash-2"
          :size="14"
        />
        {{ t('common.delete') }}
      </EaButton>
    </div>
  </div>
</template>

<style scoped>
.agent-card {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-4);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  transition: border-color var(--transition-fast) var(--easing-default);
}

.agent-card:hover {
  border-color: var(--color-border-dark);
}

.agent-card__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.agent-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.agent-card__info {
  flex: 1;
  min-width: 0;
}

.agent-card__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-card__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.agent-card__separator {
  color: var(--color-border);
}

.agent-card__status {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.agent-card__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.agent-card__status-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.agent-card__detail {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-3);
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
}

.agent-card__detail-label {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.agent-card__detail-value {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.agent-card__custom-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--spacing-2);
  font-size: var(--font-size-xs);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.agent-card__time {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.agent-card__time-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.agent-card__time-separator {
  color: var(--color-border);
}

.agent-card__sdk-toggle {
  margin-top: var(--spacing-3);
  display: flex;
  justify-content: center;
}

.agent-card__sdk-config {
  margin-top: var(--spacing-4);
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--color-border);
}

.agent-card__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-3);
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--color-border);
}
</style>
