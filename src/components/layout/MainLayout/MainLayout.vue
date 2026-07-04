<script setup lang="ts">
import { useMainLayout } from './useMainLayout'

const {
  uiStore,
  fileChangeStore,
  splitPaneStore,
  isRightFilePanelOpen,
  rightFileProject,
  rightDockWidth,
  rightTreeWidth,
  resizeTarget,
  isFileWorkspaceActive,
  isRightTerminalVisible,
  WorkspaceShell,
  BottomTerminalPanel,
  PanelContainer,
  SessionTabs,
  MessageArea,
  SplitContainer,
  PlanModePanel,
  MemoryRepoPanel,
  SoloModePanel,
  SettingsShell,
  FileTree,
  FileEditorWorkspace,
  FileChangeReviewWorkspace,
  OfficeViewerWorkspace,
  EaIcon,
  handleOpenProjectFiles,
  handleRightFileSelect,
  closeRightFilePanel,
  toggleRightTerminal,
  startResize
} = useMainLayout()
</script>

<template>
  <div class="main-layout main-layout--agent-workspace">
    <div class="main-layout__body">
      <!-- 智能体会话：WorkspaceShell 内联（左栏=项目管理，内容=会话+文件管理 dock） -->
      <WorkspaceShell
        v-show="uiStore.appMode === 'chat'"
        :sidebar-width="280"
      >
        <template #sidebar="{ hide }">
          <PanelContainer
            @open-project-files="handleOpenProjectFiles"
            @request-hide="hide"
          />
        </template>

        <div class="main-layout__chat-shell">
          <div class="main-layout__main">
            <div class="main-layout__chat-content">
              <SessionTabs v-show="!splitPaneStore.isSplitActive" />
              <SplitContainer v-if="splitPaneStore.isSplitActive" />
              <MessageArea v-else />
            </div>
          </div>
        </div>
      </WorkspaceShell>

      <!-- 其余模式各自内嵌 WorkspaceShell，按模式 v-show 切换 -->
      <PlanModePanel v-show="uiStore.appMode === 'plan'" />
      <SoloModePanel v-show="uiStore.appMode === 'solo'" />
      <MemoryRepoPanel v-show="uiStore.appMode === 'memory'" />
      <SettingsShell v-show="uiStore.appMode === 'settings'" />

      <!-- 右侧文件面板：应用级最右侧独立列，脱离中间导航栏/模式切换，仅 chat 模式显示 -->
      <aside
        v-if="uiStore.appMode === 'chat' && isRightFilePanelOpen && rightFileProject"
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
            <FileChangeReviewWorkspace
              v-if="uiStore.mainContentMode === 'fileDiff'"
              class="main-layout__file-editor"
              :session-id="fileChangeStore.activeReviewSessionId ?? ''"
              :request-id="fileChangeStore.activeReviewRequestId ?? ''"
              compact
            />
            <template v-else>
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
            </template>
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
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
