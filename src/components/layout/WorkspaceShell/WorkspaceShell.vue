<script setup lang="ts">
/** WorkspaceShell 组件：工作区外壳，含可折叠侧边栏、AppHeader 与主舞台插槽（逻辑见 useWorkspaceShell.ts） */
import { useWorkspaceShell, type WorkspaceShellProps } from './useWorkspaceShell'

const props = withDefaults(defineProps<WorkspaceShellProps>(), {
  sidebarWidth: 280,
  sidebarMin: 220,
  sidebarMax: 420,
})

const {
  t,
  EaIcon,
  AppHeader,
  isSidebarVisible,
  sidebarWidth,
  isResizing,
  showSidebar,
  hideSidebar,
  startResize
} = useWorkspaceShell(props)
</script>

<template>
  <div class="workspace-shell">
    <button
      v-if="!isSidebarVisible"
      type="button"
      class="workspace-shell__restore"
      :title="t('unified.showSidebar')"
      :aria-label="t('unified.showSidebar')"
      @click="showSidebar"
    >
      <EaIcon
        name="panel-left-open"
        :size="15"
      />
    </button>

    <aside
      v-show="isSidebarVisible"
      class="workspace-shell__sidebar"
      :style="{ width: `${sidebarWidth}px`, flexBasis: `${sidebarWidth}px` }"
    >
      <slot
        name="sidebar"
        :hide="hideSidebar"
      />
    </aside>

    <div
      v-show="isSidebarVisible"
      class="workspace-shell__resizer"
      :class="{ 'workspace-shell__resizer--active': isResizing }"
      @mousedown.prevent="startResize"
    />

    <main class="workspace-shell__stage">
      <!-- 顶部导航栏：悬浮在内容面板上方（不独占一行），居中于内容面板 -->
      <AppHeader class="workspace-shell__floating-header" />
      <slot />
    </main>
  </div>
</template>

<style scoped src="./styles.css"></style>
