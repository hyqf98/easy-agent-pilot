<script setup lang="ts">
import { useSessionTabs } from './useSessionTabs'

const {
  t,
  EaIcon,
  sessionStore,
  splitPaneStore,
  tabsContainerRef,
  switchingTabId,
  contextMenuState,
  isDragging,
  dragSessionId,
  canCloseOthers,
  canCloseLeft,
  canCloseRight,
  onDragStart,
  onDragEnd,
  onDragLeave,
  getStatusColor,
  getStatusIcon,
  switchToSession,
  closeTab,
  showContextMenu,
  handleContextMenuAction,
  handleSplitPane,
  handleWheel
} = useSessionTabs()
</script>

<template>
  <div
    v-if="sessionStore.openSessions.length > 0"
    class="session-tabs"
  >
    <div
      ref="tabsContainerRef"
      class="session-tabs__container"
      @wheel.prevent="handleWheel"
    >
      <div
        v-for="(session, index) in sessionStore.openSessions"
        :key="session.id"
        class="session-tabs__tab"
        :class="{
          'session-tabs__tab--active': session.id === sessionStore.currentSessionId,
          'session-tabs__tab--switching': session.id === switchingTabId,
          'session-tabs__tab--dragging': isDragging && dragSessionId === session.id
        }"
        :title="index < 5 ? `${session.name} (Ctrl+${index + 1})` : session.name"
        draggable="true"
        @dragstart="onDragStart($event, session.id)"
        @dragend="onDragEnd"
        @dragleave="onDragLeave"
        @click="switchToSession(session.id)"
        @contextmenu="showContextMenu($event, session.id)"
      >
        <!-- 状态指示器 -->
        <span
          class="session-tabs__status"
          :style="{ backgroundColor: getStatusColor(session.status) }"
        >
          <EaIcon
            :name="getStatusIcon(session.status)"
            :size="10"
            :spin="session.status === 'running'"
          />
        </span>

        <!-- 会话名称 -->
        <span class="session-tabs__name">
          {{ session.name }}
        </span>

        <!-- 关闭按钮 -->
        <button
          class="session-tabs__close"
          :title="t('sessionTabs.close')"
          @click="closeTab(session.id, $event)"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>
    </div>

    <!-- 溢出指示器 -->
    <div class="session-tabs__overflow-indicator" />

    <!-- 分屏按钮 -->
    <div class="session-tabs__actions">
      <button
        v-if="!splitPaneStore.isSplitActive && sessionStore.openSessions.length >= 1 && sessionStore.currentSessionId"
        class="session-tabs__action-btn"
        :title="t('sessionTabs.splitPane')"
        @click="handleSplitPane()"
      >
        <EaIcon
          name="columns"
          :size="14"
        />
      </button>
    </div>

    <div
      v-if="contextMenuState.visible"
      class="session-tabs__context-menu"
      :style="{
        left: `${contextMenuState.x}px`,
        top: `${contextMenuState.y}px`
      }"
      @click.stop
    >
      <button
        class="session-tabs__context-action"
        type="button"
        @click="handleContextMenuAction('closeAll')"
      >
        {{ t('sessionTabs.closeAll') }}
      </button>
      <button
        class="session-tabs__context-action"
        type="button"
        :disabled="!canCloseOthers"
        @click="handleContextMenuAction('closeOthers')"
      >
        {{ t('sessionTabs.closeOthers') }}
      </button>
      <button
        class="session-tabs__context-action"
        type="button"
        :disabled="!canCloseLeft"
        @click="handleContextMenuAction('closeLeft')"
      >
        {{ t('sessionTabs.closeLeft') }}
      </button>
      <button
        class="session-tabs__context-action"
        type="button"
        :disabled="!canCloseRight"
        @click="handleContextMenuAction('closeRight')"
      >
        {{ t('sessionTabs.closeRight') }}
      </button>
      <div class="session-tabs__context-divider" />
      <button
        class="session-tabs__context-action session-tabs__context-action--split"
        type="button"
        @click="handleContextMenuAction('splitPane')"
      >
        <EaIcon
          name="columns"
          :size="14"
        />
        {{ t('sessionTabs.splitPane') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
