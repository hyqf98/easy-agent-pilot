<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import AppHeader from './AppHeader.vue'

const props = withDefaults(defineProps<{
  /** 左侧栏初始宽度（px） */
  sidebarWidth?: number
  /** 左侧栏最小宽度（px） */
  sidebarMin?: number
  /** 左侧栏最大宽度（px） */
  sidebarMax?: number
}>(), {
  sidebarWidth: 280,
  sidebarMin: 220,
  sidebarMax: 420,
})

const { t } = useI18n()

const isSidebarVisible = ref(true)
const sidebarWidth = ref(props.sidebarWidth)
const isResizing = ref(false)

let resizeStartX = 0
let resizeStartWidth = 0

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function showSidebar() {
  isSidebarVisible.value = true
}

function hideSidebar() {
  isSidebarVisible.value = false
}

function handleResizeMove(event: MouseEvent) {
  if (!isResizing.value) {
    return
  }

  const deltaX = event.clientX - resizeStartX
  sidebarWidth.value = clamp(
    resizeStartWidth + deltaX,
    props.sidebarMin,
    props.sidebarMax
  )
}

function stopResize() {
  if (!isResizing.value) {
    return
  }

  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

function startResize(event: MouseEvent) {
  isResizing.value = true
  resizeStartX = event.clientX
  resizeStartWidth = sidebarWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleResizeMove, { passive: true })
  document.addEventListener('mouseup', stopResize)
}

onMounted(() => {
  document.addEventListener('mousemove', handleResizeMove, { passive: true })
  document.addEventListener('mouseup', stopResize)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
})
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

<style scoped>
.workspace-shell {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-shell__sidebar {
  position: relative;
  min-width: 0;
  max-width: none;
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--workspace-sidebar-bg);
  border-right: 1px solid var(--workspace-border);
}

.workspace-shell__restore {
  position: absolute;
  z-index: 12;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--workspace-control-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--workspace-control-bg) 94%, transparent);
  color: var(--workspace-text-tertiary);
  cursor: pointer;
}

.workspace-shell__restore:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.workspace-shell__resizer {
  flex: 0 0 4px;
  width: 4px;
  min-width: 4px;
  cursor: col-resize;
  background: transparent;
  z-index: 9;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.workspace-shell__resizer:hover,
.workspace-shell__resizer--active {
  background: color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.workspace-shell__stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--workspace-stage-bg);
}

.workspace-shell__floating-header {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
}
</style>
