<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EaIcon } from '@/components/common'
import { useMessageStore } from '@/stores/message'
import {
  extractTodoSnapshotFromMessages,
  sortTodoItems,
  type TodoItem
} from '@/utils/todoToolCall'

const props = defineProps<{
  sessionId: string | null | undefined
  defaultCollapsed?: boolean
}>()

const messageStore = useMessageStore()
const isCollapsed = ref(props.defaultCollapsed ?? true)
const panelRef = ref<HTMLElement | null>(null)

watch(() => props.sessionId, () => {
  isCollapsed.value = props.defaultCollapsed ?? true
})

const isOutsidePanel = (target: EventTarget | null) => {
  if (!panelRef.value) {
    return false
  }

  const node = target as Node | null
  if (!node) {
    return true
  }

  return !panelRef.value.contains(node)
}

const handleDocumentInteraction = (event: Event) => {
  if (isCollapsed.value || !isOutsidePanel(event.target)) {
    return
  }

  isCollapsed.value = true
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentInteraction, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentInteraction, true)
})

function parseTodoSnapshot() {
  if (!props.sessionId) {
    return null
  }

  const messages = messageStore.messagesBySession(props.sessionId)
  return extractTodoSnapshotFromMessages(messages)
}

const todoSnapshot = computed(() => parseTodoSnapshot())

const sortedTodoItems = computed(() => {
  return sortTodoItems(todoSnapshot.value?.items ?? [])
})

const completedCount = computed(() =>
  sortedTodoItems.value.filter(item => item.status === 'completed').length
)

const activeTodoItems = computed(() =>
  sortedTodoItems.value
    .filter(item => item.status === 'in_progress')
    .slice(0, 2)
)

const hiddenActiveTodoCount = computed(() =>
  Math.max(0, sortedTodoItems.value.filter(item => item.status === 'in_progress').length - activeTodoItems.value.length)
)

const formatStatusLabel = (status: TodoItem['status']) => {
  switch (status) {
    case 'in_progress':
      return '进行中'
    case 'completed':
      return '已完成'
    default:
      return '待办'
  }
}

const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <section
    v-if="todoSnapshot && sortedTodoItems.length > 0"
    ref="panelRef"
    class="conversation-todo-panel"
    :class="{ 'conversation-todo-panel--expanded': !isCollapsed }"
  >
    <button
      type="button"
      class="conversation-todo-panel__head"
      :aria-expanded="!isCollapsed"
      @click="toggleCollapsed"
    >
      <div class="conversation-todo-panel__head-main">
        <div class="conversation-todo-panel__title">
          <EaIcon
            name="list-todo"
            :size="14"
          />
          <span>待办列表</span>
        </div>
        <div
          v-if="isCollapsed && activeTodoItems.length > 0"
          class="conversation-todo-panel__active-strip"
        >
          <span
            v-for="item in activeTodoItems"
            :key="item.id"
            class="conversation-todo-panel__active-chip"
            :class="`conversation-todo-panel__active-chip--${item.status}`"
          >
            <span class="conversation-todo-panel__active-chip-dot" />
            <span class="conversation-todo-panel__active-chip-text">{{ item.content }}</span>
          </span>
          <span
            v-if="hiddenActiveTodoCount > 0"
            class="conversation-todo-panel__active-more"
          >
            +{{ hiddenActiveTodoCount }}
          </span>
        </div>
      </div>
      <div class="conversation-todo-panel__summary">
        {{ completedCount }}/{{ sortedTodoItems.length }}
        <EaIcon
          :name="isCollapsed ? 'chevron-down' : 'chevron-up'"
          :size="14"
        />
      </div>
    </button>

    <div
      v-if="!isCollapsed"
      class="conversation-todo-panel__items"
    >
      <div class="conversation-todo-panel__items-inner">
        <div
          v-for="(item, index) in sortedTodoItems"
          :key="item.id"
          class="conversation-todo-panel__item"
          :class="`conversation-todo-panel__item--${item.status}`"
          :style="{ '--todo-item-index': index }"
        >
          <span class="conversation-todo-panel__dot" />
          <div class="conversation-todo-panel__content">
            <div class="conversation-todo-panel__text">
              {{ item.content }}
            </div>
            <div
              v-if="item.activeForm"
              class="conversation-todo-panel__hint"
            >
              {{ item.activeForm }}
            </div>
          </div>
          <span class="conversation-todo-panel__status">
            {{ formatStatusLabel(item.status) }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.conversation-todo-panel {
  max-width: min(100%, 900px);
  margin: 8px auto 0;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--workspace-border, var(--color-border)) 74%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--workspace-panel-bg, var(--color-surface)) 94%, transparent);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.conversation-todo-panel--expanded {
  border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border-primary));
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.conversation-todo-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  margin-bottom: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.conversation-todo-panel--expanded .conversation-todo-panel__head {
  margin-bottom: 8px;
}

.conversation-todo-panel__head-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.conversation-todo-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.conversation-todo-panel__active-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.conversation-todo-panel__active-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(100%, 26rem);
  padding: 3px 8px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, white 8%);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1;
}

.conversation-todo-panel__active-chip--in_progress {
  border-color: color-mix(in srgb, #22c55e 28%, var(--color-border));
  background: color-mix(in srgb, #22c55e 10%, var(--color-surface));
  color: #166534;
}

.conversation-todo-panel__active-chip--pending {
  border-color: color-mix(in srgb, #60a5fa 18%, var(--color-border));
}

.conversation-todo-panel__active-chip--completed {
  opacity: 0.72;
}

.conversation-todo-panel__active-chip-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.conversation-todo-panel__active-chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-todo-panel__active-more {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.conversation-todo-panel__summary,
.conversation-todo-panel__hint,
.conversation-todo-panel__status {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.conversation-todo-panel__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.conversation-todo-panel__items {
  display: flex;
  flex-direction: column;
  max-height: min(30vh, 240px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  transform-origin: top;
}

.conversation-todo-panel__items-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conversation-todo-panel__items::-webkit-scrollbar {
  width: 6px;
}

.conversation-todo-panel__items::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.conversation-todo-panel__item {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 84%, transparent);
  box-shadow: none;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

.conversation-todo-panel__item:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}

.conversation-todo-panel__item--in_progress {
  border-color: color-mix(in srgb, #22c55e 22%, var(--color-border));
  background: color-mix(in srgb, #22c55e 10%, var(--color-bg-secondary));
}

.conversation-todo-panel__item--in_progress::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(34, 197, 94, 0.04) 24%,
      rgba(134, 239, 172, 0.34) 50%,
      rgba(34, 197, 94, 0.04) 76%,
      transparent 100%
    );
  transform: translateX(-100%);
  animation: todo-progress-sweep 3.6s ease-in-out infinite;
  pointer-events: none;
}

.conversation-todo-panel__item--in_progress::after {
  content: none;
}

.conversation-todo-panel__item--pending {
  border-color: color-mix(in srgb, #94a3b8 30%, var(--color-border));
  background: color-mix(in srgb, #cbd5e1 18%, var(--color-bg-secondary));
}

.conversation-todo-panel__item--completed {
  opacity: 0.86;
  border-color: color-mix(in srgb, var(--color-border) 56%, transparent);
}

.conversation-todo-panel__dot {
  position: relative;
  z-index: 1;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: #f59e0b;
  flex-shrink: 0;
}

.conversation-todo-panel__item--in_progress .conversation-todo-panel__dot {
  background: #22c55e;
  box-shadow: 0 0 0 4px color-mix(in srgb, #22c55e 20%, transparent);
}

.conversation-todo-panel__item--completed .conversation-todo-panel__dot {
  background: color-mix(in srgb, var(--color-text-secondary) 68%, transparent);
}

.conversation-todo-panel__content {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
}

.conversation-todo-panel__text {
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

.conversation-todo-panel__item--completed .conversation-todo-panel__text {
  text-decoration: line-through;
  color: var(--color-text-secondary);
}

.conversation-todo-panel__status {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  position: relative;
  z-index: 1;
}

.conversation-todo-panel__item--in_progress .conversation-todo-panel__status {
  color: #15803d;
  background: rgba(34, 197, 94, 0.12);
}

.conversation-todo-panel__item--pending .conversation-todo-panel__status {
  color: var(--color-text-secondary);
  background: rgba(148, 163, 184, 0.16);
}

.conversation-todo-panel__item--completed .conversation-todo-panel__status {
  color: var(--color-text-secondary);
  background: rgba(148, 163, 184, 0.14);
}

@keyframes todo-progress-sweep {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(120%);
  }
}

</style>
