<script setup lang="ts">
import { EaIcon } from '@/components/common'
import { useConversationTodoPanel, type ConversationTodoPanelProps } from './useConversationTodoPanel'

const props = defineProps<ConversationTodoPanelProps>()

const {
  panelRef,
  isCollapsed,
  todoSnapshot,
  sortedTodoItems,
  activeTodoItems,
  hiddenActiveTodoCount,
  completedCount,
  formatStatusLabel,
  toggleCollapsed
} = useConversationTodoPanel(props)
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

<style scoped src="./styles.css"></style>
