<script setup lang="ts">
import { useUIStore, type AppMode } from '@/stores/ui'
import { EaIcon } from '@/components/common'

const uiStore = useUIStore()

const modeItems: Array<{ mode: AppMode; label: string; icon: string }> = [
  { mode: 'chat', label: 'Agent', icon: 'bot' },
  { mode: 'plan', label: 'Plan', icon: 'clipboard-list' },
  { mode: 'solo', label: 'SOLO', icon: 'sparkles' },
  { mode: 'memory', label: 'Memory', icon: 'database' },
  { mode: 'settings', label: '设置', icon: 'settings' }
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
        :title="item.label"
        :aria-label="item.label"
        @click="setMode(item.mode)"
      >
        <EaIcon
          :name="item.icon"
          :size="14"
        />
        <span class="workspace-topbar__mode-label">{{ item.label }}</span>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.workspace-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  height: var(--workspace-topbar-height);
  padding: 0 10px;
  background: var(--workspace-topbar-bg);
  border-bottom: 1px solid var(--workspace-border);
  flex-shrink: 0;
}

.workspace-topbar__modes,
.workspace-topbar__mode {
  display: inline-flex;
  align-items: center;
}

.workspace-topbar__modes {
  grid-column: 2;
  justify-self: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--workspace-control-border);
  border-radius: 8px;
  background: var(--workspace-segment-bg);
}

.workspace-topbar__mode {
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  color: var(--workspace-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.workspace-topbar__mode:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.workspace-topbar__mode-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.workspace-topbar__mode--active {
  background: var(--workspace-control-active-bg);
  color: var(--workspace-text-primary);
  box-shadow: var(--workspace-control-active-shadow);
}

@media (max-width: 1080px) {
  .workspace-topbar {
    grid-template-columns: 1fr auto auto;
  }
}
</style>
