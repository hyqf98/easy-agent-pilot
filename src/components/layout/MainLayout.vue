<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { useUIStore } from '@/stores/ui'
import { useProjectStore, type Project } from '@/stores/project'
import { useSplitPaneStore } from '@/stores/splitPane'
import AppHeader from './AppHeader.vue'
import BottomTerminalPanel from './BottomTerminalPanel.vue'
import PanelContainer from './PanelContainer.vue'
import SessionTabs from './SessionTabs.vue'
import MessageArea from './messageArea/MessageArea.vue'
import { SplitContainer } from './splitPane'
import { PlanModePanel } from '@/components/plan'
import { MemoryModePanel } from '@/components/memory'
import { SoloModePanel } from '@/components/solo'
import { SettingsShell } from '@/components/settings'
import { FileTree, refreshProjectFileTreeView } from '@/components/fileTree'
import { EaIcon } from '@/components/common'
import { FileEditorWorkspace, openProjectFileInWorkspace } from '@/modules/fileEditor'
import { OfficeViewerWorkspace } from '@/modules/officeViewer'
import { useTerminalStore } from '@/stores/terminal'

const LEFT_SIDEBAR_MIN_WIDTH = 220
const LEFT_SIDEBAR_MAX_WIDTH = 420
const RIGHT_DOCK_MIN_WIDTH = 440
const RIGHT_DOCK_MAX_WIDTH = 980
const RIGHT_TREE_MIN_WIDTH = 160
const RIGHT_TREE_MAX_WIDTH = 360

const layoutStore = useLayoutStore()
const uiStore = useUIStore()
const projectStore = useProjectStore()
const splitPaneStore = useSplitPaneStore()
const terminalStore = useTerminalStore()

const rightFileProjectId = ref<string | null>(null)
const isRightFilePanelOpen = ref(false)
const isRightTerminalVisible = ref(false)
const isLeftSidebarVisible = ref(true)
const leftSidebarWidth = ref(280)
const rightDockWidth = ref(720)
const rightTreeWidth = ref(220)
const resizeTarget = ref<'left' | 'rightDock' | 'rightTree' | null>(null)

let resizeStartX = 0
let resizeStartWidth = 0
let resizeTimeout: ReturnType<typeof setTimeout> | null = null

const rightFileProject = computed(() => (
  projectStore.projects.find(project => project.id === rightFileProjectId.value) ?? null
))

const isFileWorkspaceActive = computed(() => (
  uiStore.mainContentMode === 'fileEditor' || uiStore.mainContentMode === 'officeViewer'
))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const handleWindowResize = () => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  resizeTimeout = setTimeout(() => {
    layoutStore.handleResize()
  }, 100)
}

async function handleOpenProjectFiles(project: Project) {
  rightFileProjectId.value = project.id
  isRightFilePanelOpen.value = true
  projectStore.setCurrentProject(project.id)
  uiStore.setAppMode('chat')
  await projectStore.refreshFileTree(project.id, project.path)
  await refreshProjectFileTreeView(project.id, project.path)
}

async function handleRightFileSelect(filePath: string) {
  const project = rightFileProject.value
  if (!project) {
    return
  }

  projectStore.setCurrentProject(project.id)
  await openProjectFileInWorkspace({
    projectId: project.id,
    projectPath: project.path,
    filePath
  })
}

function closeRightFilePanel() {
  isRightFilePanelOpen.value = false
  isRightTerminalVisible.value = false
  if (isFileWorkspaceActive.value) {
    uiStore.setMainContentMode('chat')
  }
}

async function toggleRightTerminal() {
  const nextVisible = !isRightTerminalVisible.value
  isRightTerminalVisible.value = nextVisible
  if (!nextVisible) {
    return
  }

  await terminalStore.bindEvents()
  await terminalStore.ensureFirstTab(projectStore.currentProjectId)
  terminalStore.setCollapsed(false)
}

function showLeftSidebar() {
  isLeftSidebarVisible.value = true
}

function hideLeftSidebar() {
  isLeftSidebarVisible.value = false
}

function handleResizeMove(event: MouseEvent) {
  if (!resizeTarget.value) {
    return
  }

  const deltaX = event.clientX - resizeStartX
  if (resizeTarget.value === 'left') {
    leftSidebarWidth.value = clamp(
      resizeStartWidth + deltaX,
      LEFT_SIDEBAR_MIN_WIDTH,
      LEFT_SIDEBAR_MAX_WIDTH
    )
    return
  }

  if (resizeTarget.value === 'rightDock') {
    rightDockWidth.value = clamp(
      resizeStartWidth - deltaX,
      RIGHT_DOCK_MIN_WIDTH,
      Math.min(RIGHT_DOCK_MAX_WIDTH, Math.floor(window.innerWidth * 0.68))
    )
    return
  }

  rightTreeWidth.value = clamp(
    resizeStartWidth + deltaX,
    RIGHT_TREE_MIN_WIDTH,
    Math.min(RIGHT_TREE_MAX_WIDTH, Math.floor(rightDockWidth.value * 0.48))
  )
}

function stopResize() {
  if (!resizeTarget.value) {
    return
  }

  resizeTarget.value = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

function startResize(target: 'left' | 'rightDock' | 'rightTree', event: MouseEvent) {
  resizeTarget.value = target
  resizeStartX = event.clientX
  resizeStartWidth = target === 'left'
    ? leftSidebarWidth.value
    : target === 'rightDock'
      ? rightDockWidth.value
      : rightTreeWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleResizeMove, { passive: true })
  document.addEventListener('mouseup', stopResize)
}

onMounted(async () => {
  layoutStore.handleResize()
  window.addEventListener('resize', handleWindowResize)
  await projectStore.loadProjects()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  stopResize()
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})

watch(
  () => projectStore.currentProjectId,
  (nextProjectId, previousProjectId) => {
    if (!previousProjectId && nextProjectId && uiStore.projectCreateModalVisible) {
      uiStore.closeProjectCreateModal()
    }
  }
)

watch(rightFileProject, (project) => {
  if (!project) {
    isRightFilePanelOpen.value = false
  }
})
</script>

<template>
  <div class="main-layout main-layout--agent-workspace">
    <AppHeader />

    <div class="main-layout__body">
      <div
        v-show="uiStore.appMode !== 'settings'"
        class="main-layout__workspace"
      >
        <button
          v-if="!isLeftSidebarVisible"
          type="button"
          class="main-layout__sidebar-restore"
          title="显示项目管理"
          aria-label="显示项目管理"
          @click="showLeftSidebar"
        >
          <EaIcon
            name="panel-left-open"
            :size="15"
          />
        </button>

        <aside
          v-if="isLeftSidebarVisible"
          class="main-layout__sidebar"
          :style="{ width: `${leftSidebarWidth}px`, flexBasis: `${leftSidebarWidth}px` }"
        >
          <PanelContainer
            @open-project-files="handleOpenProjectFiles"
            @request-hide="hideLeftSidebar"
          />
        </aside>

        <div
          v-if="isLeftSidebarVisible"
          class="main-layout__resizer main-layout__resizer--left"
          :class="{ 'main-layout__resizer--active': resizeTarget === 'left' }"
          @mousedown.prevent="startResize('left', $event)"
        />

        <main class="main-layout__stage">
          <section
            v-show="uiStore.appMode === 'plan'"
            class="main-layout__mode-panel main-layout__mode-panel--plan"
          >
            <PlanModePanel />
          </section>

          <section
            v-show="uiStore.appMode === 'solo'"
            class="main-layout__mode-panel main-layout__mode-panel--solo"
          >
            <SoloModePanel />
          </section>

          <section
            v-show="uiStore.appMode === 'memory'"
            class="main-layout__mode-panel main-layout__mode-panel--memory"
          >
            <MemoryModePanel />
          </section>

          <section
            v-show="uiStore.appMode === 'chat'"
            class="main-layout__chat-shell"
            :class="{ 'main-layout__chat-shell--with-right-dock': isRightFilePanelOpen && rightFileProject }"
          >
            <div class="main-layout__main">
              <div class="main-layout__chat-content">
                <SessionTabs v-show="!splitPaneStore.isSplitActive" />
                <SplitContainer v-if="splitPaneStore.isSplitActive" />
                <MessageArea v-else />
              </div>
            </div>

            <aside
              v-if="isRightFilePanelOpen && rightFileProject"
              class="main-layout__right-dock"
              :style="{ width: `${rightDockWidth}px` }"
            >
              <div
                class="main-layout__resizer main-layout__resizer--right-dock"
                :class="{ 'main-layout__resizer--active': resizeTarget === 'rightDock' }"
                @mousedown.prevent="startResize('rightDock', $event)"
              />
              <section class="main-layout__file-manager">
                <header class="main-layout__file-manager-header">
                  <div class="main-layout__file-manager-title">
                    <EaIcon
                      name="files"
                      :size="14"
                    />
                    <span>{{ rightFileProject.name }}</span>
                  </div>
                  <span class="main-layout__file-manager-path">{{ rightFileProject.path }}</span>
                  <div class="main-layout__file-manager-actions">
                    <button
                      type="button"
                      class="main-layout__file-manager-action main-layout__file-manager-action--active"
                      title="文件管理"
                      aria-label="文件管理"
                    >
                      <EaIcon
                        name="files"
                        :size="14"
                      />
                    </button>
                    <button
                      type="button"
                      class="main-layout__file-manager-action"
                      :class="{ 'main-layout__file-manager-action--active': isRightTerminalVisible }"
                      title="终端"
                      aria-label="终端"
                      @click="toggleRightTerminal"
                    >
                      <EaIcon
                        name="terminal"
                        :size="14"
                      />
                    </button>
                    <button
                      type="button"
                      class="main-layout__file-manager-action"
                      title="关闭文件管理"
                      aria-label="关闭文件管理"
                      @click="closeRightFilePanel"
                    >
                      <EaIcon
                        name="x"
                        :size="14"
                      />
                    </button>
                  </div>
                </header>

                <div class="main-layout__file-manager-body">
                  <div
                    class="main-layout__file-tree-pane"
                    :style="{ width: `${rightTreeWidth}px` }"
                  >
                    <FileTree
                      :project-id="rightFileProject.id"
                      :project-path="rightFileProject.path"
                      class="main-layout__file-tree"
                      @file-select="handleRightFileSelect"
                    />
                  </div>
                  <div
                    class="main-layout__resizer main-layout__resizer--right-tree"
                    :class="{ 'main-layout__resizer--active': resizeTarget === 'rightTree' }"
                    @mousedown.prevent="startResize('rightTree', $event)"
                  />

                  <div class="main-layout__file-viewer-pane">
                    <FileEditorWorkspace
                      v-show="uiStore.mainContentMode === 'fileEditor'"
                      class="main-layout__file-editor"
                      compact
                    />
                    <OfficeViewerWorkspace
                      v-show="uiStore.mainContentMode === 'officeViewer'"
                      class="main-layout__file-editor"
                      compact
                    />
                    <div
                      v-if="!isFileWorkspaceActive"
                      class="main-layout__file-viewer-empty"
                    >
                      <EaIcon
                        name="file-text"
                        :size="22"
                      />
                      <span>选择文件查看</span>
                    </div>
                  </div>
                </div>

                <BottomTerminalPanel
                  v-if="isRightTerminalVisible"
                  variant="workspace"
                  :force-expanded="true"
                  :show-collapse-control="false"
                  class="main-layout__right-terminal"
                />
              </section>
            </aside>
          </section>
        </main>
      </div>

      <section
        v-if="uiStore.appMode === 'settings'"
        class="main-layout__settings-view"
      >
        <SettingsShell />
      </section>
    </div>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--workspace-app-bg);
  color: var(--workspace-text-primary);
}

.main-layout__body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-layout__workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.main-layout__settings-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.main-layout__sidebar {
  position: relative;
  width: var(--workspace-sidebar-width);
  min-width: 0;
  max-width: none;
  flex: 0 0 var(--workspace-sidebar-width);
  min-height: 0;
  overflow: hidden;
  background: var(--workspace-sidebar-bg);
  border-right: 1px solid var(--workspace-border);
}

.main-layout__sidebar-restore {
  position: absolute;
  z-index: 12;
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

.main-layout__sidebar-restore {
  top: 8px;
  left: 8px;
}

.main-layout__sidebar-restore:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.main-layout__resizer {
  flex: 0 0 4px;
  width: 4px;
  min-width: 4px;
  cursor: col-resize;
  background: transparent;
  z-index: 9;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.main-layout__resizer:hover,
.main-layout__resizer--active {
  background: color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.main-layout__resizer--right-dock {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2px;
}

.main-layout__resizer--right-tree {
  height: 100%;
  align-self: stretch;
}

.main-layout__stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--workspace-stage-bg);
}

.main-layout__chat-shell,
.main-layout__mode-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-layout__chat-shell {
  flex-direction: row;
}

.main-layout__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-layout__chat-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.main-layout__file-editor {
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.main-layout__right-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 720px;
  min-width: 0;
  max-width: none;
  min-height: 0;
  border-left: 1px solid var(--workspace-border);
  background: var(--workspace-sidebar-bg);
  overflow: hidden;
}

.main-layout__right-terminal {
  flex: 0 0 auto;
  min-width: 0;
  border-top: 1px solid color-mix(in srgb, var(--workspace-border) 82%, transparent);
}

.main-layout__file-manager {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--workspace-stage-bg);
  overflow: hidden;
}

.main-layout__file-manager-header {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid var(--workspace-border);
  background: color-mix(in srgb, var(--workspace-sidebar-bg) 92%, transparent);
}

.main-layout__file-manager-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--workspace-text-primary);
  font-size: 12px;
  font-weight: 600;
}

.main-layout__file-manager-title span,
.main-layout__file-manager-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-layout__file-manager-path {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  font-size: 11px;
}

.main-layout__file-manager-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.main-layout__file-manager-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.main-layout__file-manager-action:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.main-layout__file-manager-action--active {
  background: var(--workspace-list-active-bg);
  color: var(--workspace-text-primary);
  box-shadow: inset 0 0 0 1px var(--workspace-border);
}

.main-layout__file-manager-body {
  display: grid;
  grid-template-columns: auto 4px minmax(0, 1fr);
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.main-layout__file-tree-pane {
  width: 220px;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--workspace-border);
  background: var(--workspace-sidebar-bg);
  overflow: hidden;
}

.main-layout__file-tree {
  min-width: 0;
  min-height: 0;
}

.main-layout__file-viewer-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface);
  overflow: hidden;
}

.main-layout__file-viewer-empty {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.main-layout__file-viewer-pane :deep(.file-editor-workspace__toolbar),
.main-layout__file-viewer-pane :deep(.office-viewer-workspace__toolbar) {
  height: 38px;
  min-height: 38px;
  padding: 0 10px;
}

.main-layout__file-viewer-pane :deep(.file-editor-workspace__file-name),
.main-layout__file-viewer-pane :deep(.office-viewer-workspace__file-name) {
  max-width: 180px;
}

.main-layout__file-viewer-pane :deep(.file-editor-workspace),
.main-layout__file-viewer-pane :deep(.office-viewer-workspace) {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.main-layout__file-viewer-pane :deep(.monaco-editor .monaco-scrollable-element > .scrollbar.vertical),
.main-layout__file-viewer-pane :deep(.monaco-editor .monaco-scrollable-element > .scrollbar.horizontal) {
  opacity: 1;
}

@media (max-width: 920px) {
  .main-layout__sidebar {
    min-width: 0;
  }
}

@media (max-width: 1240px) {
  .main-layout__right-dock {
    max-width: none;
  }
}

@media (max-width: 1040px) {
  .main-layout__right-dock {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 8;
    width: min(92vw, 720px);
    min-width: 0;
    max-width: none;
    box-shadow: -16px 0 32px rgba(15, 23, 42, 0.14);
  }
}
</style>
