<script setup lang="ts">
/** AppHeader 组件：顶部模式切换导航条，按模式项切换工作区模式（逻辑见 useAppHeader.ts） */
import { useAppHeader } from './useAppHeader'

const { t, uiStore, modeItems, setMode, EaIcon } = useAppHeader()
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

<style scoped src="./styles.css"></style>
