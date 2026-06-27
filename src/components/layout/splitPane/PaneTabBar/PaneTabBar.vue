<script setup lang="ts">
import { usePaneTabBar, type PaneTabBarEmits, type PaneTabBarProps } from './usePaneTabBar'

const props = defineProps<PaneTabBarProps>()
const emit = defineEmits<PaneTabBarEmits>()

const {
  t,
  EaIcon,
  activeSessionId,
  tabsContainerRef,
  showOverflowMenu,
  visibleTabs,
  overflowTabs,
  hasOverflow,
  getStatusColor,
  getStatusIcon,
  handleSwitch,
  handleClose,
  handleFocusPane,
  handleTabDragStart,
  handleTabDragEnd,
  handlePaneDragMouseDown,
  handleOverflowSwitch
} = usePaneTabBar(props, emit)
</script>

<template>
  <div
    class="pane-tab-bar"
    :class="{
      'pane-tab-bar--focused': isFocused,
      'pane-tab-bar--mini': isMini
    }"
    @click="handleFocusPane"
  >
    <span
      class="pane-tab-bar__grip"
      title="拖动分屏"
      @mousedown="handlePaneDragMouseDown"
    >
      <EaIcon
        name="grip-vertical"
        :size="12"
      />
    </span>

    <div
      ref="tabsContainerRef"
      class="pane-tab-bar__container"
    >
      <div
        v-for="session in visibleTabs"
        :key="session.id"
        class="pane-tab-bar__tab"
        :class="{
          'pane-tab-bar__tab--active': session.id === activeSessionId
        }"
        :title="session.name"
        draggable="true"
        @click.stop="handleSwitch(session.id)"
        @dragstart="handleTabDragStart($event, session.id)"
        @dragend="handleTabDragEnd"
      >
        <span
          class="pane-tab-bar__status"
          :style="{ backgroundColor: getStatusColor(session.status) }"
        >
          <EaIcon
            :name="getStatusIcon(session.status)"
            :size="10"
            :spin="session.status === 'running'"
          />
        </span>
        <span class="pane-tab-bar__name">{{ session.name || t('session.unnamedSession') }}</span>
        <button
          class="pane-tab-bar__close"
          :title="t('sessionTabs.close')"
          @click="handleClose(session.id, $event)"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>
    </div>

    <div
      v-if="hasOverflow"
      class="pane-tab-bar__overflow"
    >
      <button
        class="pane-tab-bar__overflow-trigger"
        title="更多会话"
        @click.stop="showOverflowMenu = !showOverflowMenu"
      >
        <EaIcon
          name="chevron-down"
          :size="14"
        />
      </button>
      <div
        v-if="showOverflowMenu"
        class="pane-tab-bar__overflow-menu"
        @click.stop
      >
        <button
          v-for="session in overflowTabs"
          :key="session.id"
          class="pane-tab-bar__overflow-item"
          :class="{ 'pane-tab-bar__overflow-item--active': session.id === activeSessionId }"
          :title="session.name"
          @click="handleOverflowSwitch(session.id)"
        >
          <span
            class="pane-tab-bar__status"
            :style="{ backgroundColor: getStatusColor(session.status) }"
          />
          <span class="pane-tab-bar__overflow-name">{{ session.name || t('session.unnamedSession') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
