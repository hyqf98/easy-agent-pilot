<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useSkillConfigStore } from '@/stores/skillConfig'
import { EaIcon } from '@/components/common'

const { t } = useI18n()

const sessionStore = useSessionStore()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const sessionExecutionStore = useSessionExecutionStore()
const skillConfigStore = useSkillConfigStore()

// 下拉框状态
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// 当前会话 ID
const currentSessionId = computed(() => sessionStore.currentSessionId)

// 当前选中的智能体 ID
const currentAgentId = computed(() => sessionStore.currentSession?.agentType || null)

// 当前选中的智能体对象
const currentAgent = computed(() => {
  const agentId = currentAgentId.value
  if (!agentId) return null
  return agentStore.agents.find(a => a.id === agentId) || null
})

// 获取当前智能体的 MCP 配置列表（根据智能体类型选择数据源）
const mcpConfigs = computed(() => {
  const agentId = currentAgentId.value
  if (!agentId) return []

  // CLI 类型智能体：从 skillConfigStore 获取
  if (currentAgent.value?.type === 'cli') {
    return skillConfigStore.mcpConfigs
  }

  // SDK 类型智能体：从 agentConfigStore 获取
  return agentConfigStore.getMcpConfigs(agentId)
})

// MCP 选项列表
const mcpOptions = computed(() => {
  return mcpConfigs.value.map(config => ({
    id: config.id,
    name: config.name,
    transportType: config.transportType
  }))
})

// 获取当前会话已启用的 MCP ID 列表
const enabledMcpIds = computed(() => {
  const sessionId = currentSessionId.value
  if (!sessionId) return []
  return sessionExecutionStore.getEnabledMcpIds(sessionId)
})

// 是否全选
const isAllSelected = computed(() => {
  if (mcpOptions.value.length === 0) return false
  return enabledMcpIds.value.length === mcpOptions.value.length
})

// 选中数量文本
const selectionText = computed(() => {
  const enabled = enabledMcpIds.value.length
  const total = mcpOptions.value.length
  return t('mcpSelector.selected', { enabled, total })
})

// 是否无可用插件
const hasNoPlugins = computed(() => mcpOptions.value.length === 0)
const displayText = computed(() => (hasNoPlugins.value ? t('mcpSelector.noPlugins') : selectionText.value))
const canToggleDropdown = computed(() => Boolean(currentSessionId.value && currentAgentId.value))

// 切换下拉框
const toggleDropdown = () => {
  if (!canToggleDropdown.value) return
  isOpen.value = !isOpen.value
}

// 点击外部关闭下拉框
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

// 切换单个 MCP
const toggleMcp = (mcpId: string) => {
  const sessionId = currentSessionId.value
  if (!sessionId) return
  sessionExecutionStore.toggleMcpId(sessionId, mcpId)
}

// 全选/取消全选
const toggleAll = () => {
  const sessionId = currentSessionId.value
  if (!sessionId) return
  const allIds = mcpOptions.value.map(m => m.id)
  sessionExecutionStore.toggleAllMcpIds(sessionId, allIds, !isAllSelected.value)
}

// 监听智能体变化，初始化 MCP 选择（默认全选）
watch(currentAgentId, async (newAgentId) => {
  const sessionId = currentSessionId.value
  if (!sessionId || !newAgentId) return

  // 根据智能体类型加载 MCP 配置

  let allIds: string[]

  if (currentAgent.value?.type === 'cli') {
    // CLI 类型：使用 skillConfigStore 加载
    await skillConfigStore.selectAgent(currentAgent.value)
    allIds = skillConfigStore.mcpConfigs.map(c => c.id)
  } else {
    // SDK 类型：使用 agentConfigStore 加载
    await agentConfigStore.loadMcpConfigs(newAgentId)
    allIds = agentConfigStore.getMcpConfigs(newAgentId).map(c => c.id)
  }


  // 切换智能体时，重置 MCP 选择为新智能体的全部 MCP
  if (allIds.length > 0) {
    sessionExecutionStore.setEnabledMcpIds(sessionId, allIds)
  }
}, { immediate: true })

// 监听下拉框状态，添加/移除点击事件监听器
watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})

watch(
  () => [currentSessionId.value, currentAgentId.value, hasNoPlugins.value],
  () => {
    if (!canToggleDropdown.value || hasNoPlugins.value) {
      isOpen.value = false
    }
  }
)

// 获取传输类型显示文本
const getTransportLabel = (type: string) => {
  switch (type.toLowerCase()) {
    case 'stdio':
      return 'STDIO'
    case 'sse':
      return 'SSE'
    case 'http':
      return 'HTTP'
    default:
      return type.toUpperCase()
  }
}
</script>

<template>
  <div
    ref="dropdownRef"
    class="input-chip"
    :class="{ 'input-chip--open': isOpen }"
  >
    <button
      class="input-chip__btn"
      :disabled="!canToggleDropdown"
      @click="toggleDropdown"
    >
      <EaIcon
        name="puzzle"
        :size="12"
      />
      <span>{{ displayText }}</span>
      <EaIcon
        :name="isOpen ? 'chevron-up' : 'chevron-down'"
        :size="10"
      />
    </button>
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="input-chip__menu"
      >
        <div
          v-if="hasNoPlugins"
          class="input-chip__empty"
        >
          {{ t('mcpSelector.noPlugins') }}
        </div>

        <template v-else>
          <!-- 全选按钮 -->
          <div
            class="input-chip__option"
            @click="toggleAll"
          >
            <EaIcon
              :name="isAllSelected ? 'check-square' : 'square'"
              :size="12"
              @click.stop
            />
            <span>{{ t('mcpSelector.selectAll') }}</span>
          </div>

          <!-- 分割线 -->
          <div class="input-chip__divider" />

          <!-- MCP 列表 -->
          <div
            v-for="mcp in mcpOptions"
            :key="mcp.id"
            class="input-chip__option"
            :class="{ 'input-chip__option--selected': enabledMcpIds.includes(mcp.id) }"
            @click="toggleMcp(mcp.id)"
          >
            <EaIcon
              :name="enabledMcpIds.includes(mcp.id) ? 'check-square' : 'square'"
              :size="12"
              @click.stop
            />
            <span>{{ mcp.name }}</span>
            <span class="input-chip__tag">{{ getTransportLabel(mcp.transportType) }}</span>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 小芯片选择器基础样式 */
.input-chip {
  position: relative;
  flex-shrink: 0;
}

.input-chip__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: var(--color-bg-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  white-space: nowrap;
  max-width: 120px;
}

.input-chip__btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.input-chip__btn:hover:not(:disabled) {
  background-color: var(--color-surface-hover);
}

.input-chip--open .input-chip__btn {
  background-color: var(--color-primary-light);
}

.input-chip__btn span {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input-chip__btn svg {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.input-chip--open .input-chip__btn span,
.input-chip--open .input-chip__btn svg {
  color: var(--color-primary);
}

.input-chip__menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: var(--spacing-1);
}

.input-chip__option {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast) var(--easing-default);
}

.input-chip__option svg {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.input-chip__option:hover {
  background-color: var(--color-surface-hover);
}

.input-chip__option--selected,
.input-chip__option--selected:hover {
  background-color: var(--color-primary-light);
}

.input-chip__option--selected span {
  color: var(--color-primary);
  font-weight: 500;
}

.input-chip__option--selected svg {
  color: var(--color-primary);
}

.input-chip__divider {
  height: 1px;
  background-color: var(--color-border);
  margin: var(--spacing-1) 0;
}

/* tag 样式，使用主色调 */
.input-chip__tag {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.input-chip__empty {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

/* 下拉框动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all var(--transition-fast) var(--easing-default);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
