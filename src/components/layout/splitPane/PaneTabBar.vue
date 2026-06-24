<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore, type SessionStatus } from '@/stores/session'
import { useSplitPaneStore } from '@/stores/splitPane'
import { EaIcon } from '@/components/common'
import { useTabDrag } from './useTabDrag'

interface Props {
  paneId: string
  isFocused: boolean
  isMini?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  focus: [paneId: string]
  dragstart: [paneId: string]
}>()

const { t } = useI18n()
const sessionStore = useSessionStore()
const splitPaneStore = useSplitPaneStore()
const { startTabDrag, endTabDrag } = useTabDrag()

const tabsContainerRef = ref<HTMLElement | null>(null)

const pane = computed(() => splitPaneStore.getPaneById(props.paneId))
const sessionIds = computed(() => pane.value?.sessionIds ?? [])
const activeSessionId = computed(() => pane.value?.activeSessionId ?? null)

// 溢出处理：测量容器宽度，超出时把多余的 tab 收进尾部下拉
const showOverflowMenu = ref(false)
const containerWidth = ref(0)
const TAB_MIN = 90 // 每个 tab 最小可见宽度

const visibleSessions = computed(() => {
  const all = sessionIds.value
    .map(id => sessionStore.sessions.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
  return all
})

const visibleTabs = computed(() => {
  if (!containerWidth.value) return visibleSessions.value
  const maxFit = Math.max(1, Math.floor(containerWidth.value / TAB_MIN))
  return visibleSessions.value.slice(0, maxFit)
})

const overflowTabs = computed(() => {
  if (!containerWidth.value) return []
  const maxFit = Math.max(1, Math.floor(containerWidth.value / TAB_MIN))
  return visibleSessions.value.slice(maxFit)
})

const hasOverflow = computed(() => overflowTabs.value.length > 0)

function measureContainer() {
  if (tabsContainerRef.value) {
    containerWidth.value = tabsContainerRef.value.clientWidth
  }
}

// ResizeObserver 在 PaneWrapper 中已观测宽度变化，这里通过 watch 容器尺寸自适应
let resizeObserver: ResizeObserver | null = null

watch(tabsContainerRef, (el) => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (el) {
    resizeObserver = new ResizeObserver(() => measureContainer())
    resizeObserver.observe(el)
    nextTick(measureContainer)
  }
})

// 会话变化时重新测量
watch([sessionIds, activeSessionId], () => {
  nextTick(measureContainer)
})

const getStatusColor = (status: SessionStatus): string => {
  switch (status) {
    case 'running':
      return 'var(--color-success)'
    case 'paused':
      return 'var(--color-warning)'
    case 'error':
      return 'var(--color-danger)'
    case 'completed':
      return 'var(--color-primary)'
    default:
      return 'var(--color-text-tertiary)'
  }
}

const getStatusIcon = (status: SessionStatus): string => {
  switch (status) {
    case 'running':
      return 'loader'
    case 'paused':
      return 'pause-circle'
    case 'error':
      return 'alert-circle'
    case 'completed':
      return 'check-circle'
    default:
      return 'circle'
  }
}

function handleSwitch(sessionId: string) {
  splitPaneStore.setActiveSessionInPane(props.paneId, sessionId)
  emit('focus', props.paneId)
}

function handleClose(sessionId: string, event: Event) {
  event.stopPropagation()
  splitPaneStore.removeSessionFromPane(props.paneId, sessionId)
}

function handleFocusPane() {
  emit('focus', props.paneId)
}

function handleTabDragStart(event: DragEvent, sessionId: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', sessionId)
  startTabDrag(props.paneId, sessionId)
  emit('focus', props.paneId)
}

function handleTabDragEnd() {
  endTabDrag()
}

// 整个 pane 的拖拽手柄（重排 pane）
function handlePaneDragMouseDown(event: MouseEvent) {
  // 仅 grip 区域触发，由 PaneWrapper 处理实际重排
  emit('dragstart', props.paneId)
  // 阻止冒泡到 pane header 点击聚焦
  event.stopPropagation()
}

function handleOverflowSwitch(sessionId: string) {
  handleSwitch(sessionId)
  showOverflowMenu.value = false
}
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

<style scoped>
.pane-tab-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  height: 30px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  user-select: none;
  cursor: pointer;
  min-width: 0;
}

.pane-tab-bar--focused {
  border-bottom-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary-light, var(--color-surface)) 40%, var(--color-surface));
}

.pane-tab-bar--mini {
  height: 26px;
  padding: 0 4px;
}

.pane-tab-bar__grip {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--color-text-quaternary);
  opacity: 0.4;
  cursor: grab;
  transition: opacity var(--transition-fast) var(--easing-default);
}

.pane-tab-bar__grip:hover {
  opacity: 1;
}

.pane-tab-bar--mini .pane-tab-bar__grip {
  display: none;
}

.pane-tab-bar__container {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.pane-tab-bar__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 10px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  flex: 0 1 auto;
  min-width: 0;
  border: 1px solid transparent;
  transition: all var(--transition-fast) var(--easing-default);
}

.pane-tab-bar__tab:hover {
  background-color: var(--color-surface-hover);
}

.pane-tab-bar__tab--active {
  background-color: var(--color-primary-light);
  border-color: var(--color-primary);
}

.pane-tab-bar__tab--active .pane-tab-bar__name {
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
}

[data-theme='dark'] .pane-tab-bar__tab--active {
  background-color: var(--color-active-bg);
  border-color: var(--color-active-border);
}

[data-theme='dark'] .pane-tab-bar__tab--active .pane-tab-bar__name {
  color: var(--color-active-text);
}

.pane-tab-bar__status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: white;
  flex-shrink: 0;
}

.pane-tab-bar__name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-tab-bar__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
  opacity: 0;
  transition: all var(--transition-fast) var(--easing-default);
}

.pane-tab-bar__tab:hover .pane-tab-bar__close {
  opacity: 1;
}

.pane-tab-bar__close:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.pane-tab-bar__overflow {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.pane-tab-bar__overflow-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.pane-tab-bar__overflow-trigger:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.pane-tab-bar__overflow-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 50;
  display: flex;
  min-width: 140px;
  max-width: 240px;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 96%, white);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

[data-theme='dark'] .pane-tab-bar__overflow-menu {
  background: color-mix(in srgb, var(--color-surface, #111827) 90%, #020617);
  border-color: rgba(148, 163, 184, 0.18);
  box-shadow: 0 16px 36px rgba(2, 6, 23, 0.38);
}

.pane-tab-bar__overflow-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.pane-tab-bar__overflow-item:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.pane-tab-bar__overflow-item--active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.pane-tab-bar__overflow-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
