<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore, type AgentConfig } from '@/stores/agent'
import { EaIcon } from '@/components/common'

const props = defineProps<{
  modelValue: AgentConfig | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AgentConfig | null): void
}>()

const { t } = useI18n()
const agentStore = useAgentStore()

// 分组智能体
const cliAgents = computed(() =>
  agentStore.agents.filter(a => a.type === 'cli')
)

const sdkAgents = computed(() =>
  agentStore.agents.filter(a => a.type === 'sdk')
)

const noAgents = computed(() => agentStore.agents.length === 0)

// 监听智能体列表变化，自动选择第一个
watch(() => agentStore.agents, (agents) => {
  if (agents.length > 0 && !props.modelValue) {
    emit('update:modelValue', agents[0])
  }
}, { immediate: true })

function selectAgent(agent: AgentConfig) {
  emit('update:modelValue', agent)
}

function getAgentIcon(type: string) {
  return type === 'cli' ? 'lucide:terminal' : 'lucide:bot'
}

function getAgentTypeLabel(type: string) {
  return type === 'cli' ? 'CLI' : 'SDK'
}
</script>

<template>
  <div class="agent-selector">
    <div class="agent-selector__label">
      {{ t('settings.agentConfig.selectAgent') }}
    </div>

    <div class="agent-selector__dropdown">
      <div class="agent-selector__current" :class="{ 'agent-selector__current--placeholder': !modelValue }">
        <template v-if="modelValue">
          <EaIcon :name="getAgentIcon(modelValue.type)" class="agent-selector__icon" />
          <span class="agent-selector__name">{{ modelValue.name }}</span>
          <span class="agent-selector__type">{{ getAgentTypeLabel(modelValue.type) }}</span>
        </template>
        <template v-else>
          <span class="agent-selector__placeholder">{{ t('settings.agentConfig.selectAgentPlaceholder') }}</span>
        </template>
        <EaIcon name="lucide:chevron-down" class="agent-selector__chevron" />
      </div>

      <div class="agent-selector__menu">
        <!-- CLI 类型智能体 -->
        <div v-if="cliAgents.length > 0" class="agent-selector__group">
          <div class="agent-selector__group-label">{{ t('settings.agentConfig.cliAgents') }}</div>
          <div
            v-for="agent in cliAgents"
            :key="agent.id"
            class="agent-selector__option"
            :class="{ 'agent-selector__option--active': modelValue?.id === agent.id }"
            @click="selectAgent(agent)"
          >
            <EaIcon :name="getAgentIcon(agent.type)" class="agent-selector__option-icon" />
            <span class="agent-selector__option-name">{{ agent.name }}</span>
            <span class="agent-selector__option-provider">{{ agent.provider }}</span>
          </div>
        </div>

        <!-- SDK 类型智能体 -->
        <div v-if="sdkAgents.length > 0" class="agent-selector__group">
          <div class="agent-selector__group-label">{{ t('settings.agentConfig.sdkAgents') }}</div>
          <div
            v-for="agent in sdkAgents"
            :key="agent.id"
            class="agent-selector__option"
            :class="{ 'agent-selector__option--active': modelValue?.id === agent.id }"
            @click="selectAgent(agent)"
          >
            <EaIcon :name="getAgentIcon(agent.type)" class="agent-selector__option-icon" />
            <span class="agent-selector__option-name">{{ agent.name }}</span>
            <span class="agent-selector__option-provider">{{ agent.provider }}</span>
          </div>
        </div>

        <!-- 无智能体提示 -->
        <div v-if="noAgents" class="agent-selector__empty">
          <EaIcon name="lucide:inbox" class="agent-selector__empty-icon" />
          <span>{{ t('settings.agentConfig.noAgents') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-selector {
  margin-bottom: var(--spacing-4);
}

.agent-selector__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.agent-selector__dropdown {
  position: relative;
}

.agent-selector__current {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s;
}

.agent-selector__current:hover {
  border-color: var(--color-border-hover);
}

.agent-selector__current--placeholder {
  color: var(--color-text-tertiary);
}

.agent-selector__icon {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
}

.agent-selector__name {
  flex: 1;
  font-size: var(--font-size-sm);
}

.agent-selector__type {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background: var(--color-background-secondary);
  border-radius: var(--radius-sm);
}

.agent-selector__chevron {
  width: 14px;
  height: 14px;
  color: var(--color-text-tertiary);
  margin-left: auto;
}

.agent-selector__menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: var(--spacing-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: all 0.2s;
}

.agent-selector__dropdown:focus-within .agent-selector__menu,
.agent-selector__dropdown:hover .agent-selector__menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.agent-selector__group {
  padding: var(--spacing-1);
}

.agent-selector__group-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-tertiary);
  padding: var(--spacing-1) var(--spacing-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.agent-selector__option {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s;
}

.agent-selector__option:hover {
  background: var(--color-background-secondary);
}

.agent-selector__option--active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.agent-selector__option-icon {
  width: 14px;
  height: 14px;
  color: inherit;
}

.agent-selector__option-name {
  flex: 1;
  font-size: var(--font-size-sm);
}

.agent-selector__option-provider {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.agent-selector__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-6);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.agent-selector__empty-icon {
  width: 24px;
  height: 24px;
  opacity: 0.5;
}
</style>
