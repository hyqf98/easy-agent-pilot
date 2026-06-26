<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUIStore, type AppMode } from '@/stores/ui'
import { EaIcon } from '@/components/common'

const { t } = useI18n()
const uiStore = useUIStore()

const modeItems: Array<{ mode: AppMode; labelKey: string; icon: string }> = [
  { mode: 'chat', labelKey: 'navModes.agent', icon: 'bot' },
  { mode: 'plan', labelKey: 'navModes.plan', icon: 'clipboard-list' },
  { mode: 'solo', labelKey: 'navModes.solo', icon: 'sparkles' },
  { mode: 'memory', labelKey: 'navModes.memory', icon: 'database' },
  { mode: 'settings', labelKey: 'navModes.settings', icon: 'settings' }
]

function setMode(mode: AppMode) {
  // settings 为接管主区域的超级模式，经 openSettings 进入以记录可恢复的上一工作模式
  if (mode === 'settings') {
    uiStore.openSettings()
    return
  }
  uiStore.setAppMode(mode)
  if (mode === 'chat') {
    uiStore.setMainContentMode('chat')
  }
}
</script>

<template>
  <header class="workspace-topbar">
    <nav
      class="workspace-topbar__modes"
      aria-label="Workspace modes"
    >
      <button
        v-for="item in modeItems"
        :key="item.mode"
        type="button"
        class="workspace-topbar__mode"
        :class="{ 'workspace-topbar__mode--active': uiStore.appMode === item.mode }"
        :title="t(item.labelKey)"
        :aria-label="t(item.labelKey)"
        @click="setMode(item.mode)"
      >
        <EaIcon
          :name="item.icon"
          :size="14"
        />
        <span class="workspace-topbar__mode-label">{{ t(item.labelKey) }}</span>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.workspace-topbar {
  display: inline-flex;
  align-items: center;
  height: var(--workspace-topbar-height);
  padding: 4px;
  background: color-mix(in srgb, var(--workspace-topbar-bg) 82%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.workspace-topbar__modes,
.workspace-topbar__mode {
  display: inline-flex;
  align-items: center;
}

.workspace-topbar__modes {
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--workspace-control-border);
  border-radius: 10px;
  background: var(--workspace-segment-bg);
}

.workspace-topbar__mode {
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 7px;
  color: var(--workspace-text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.workspace-topbar__mode:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.workspace-topbar__mode-label {
  line-height: 1;
}

.workspace-topbar__mode--active {
  background: var(--workspace-control-active-bg);
  color: var(--workspace-text-primary);
  box-shadow: var(--workspace-control-active-shadow);
}
</style>
