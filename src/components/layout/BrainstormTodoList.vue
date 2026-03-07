<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBrainstormStore } from '@/stores/brainstorm'
import { EaIcon } from '@/components/common'

const props = defineProps<{
  sessionId: string | null
}>()

const brainstormStore = useBrainstormStore()
const isCollapsed = ref(true)  // 默认收起

const isBrainstormMode = computed(() => {
  if (!props.sessionId) return false
  return brainstormStore.getSessionMode(props.sessionId) === 'brainstorm'
})

const todos = computed(() => {
  if (!props.sessionId) return []
  return brainstormStore.getSessionTodos(props.sessionId)
})

const completedCount = computed(() => {
  return todos.value.filter(t => t.status === 'completed').length
})

watch(
  () => props.sessionId,
  async (sessionId) => {
    if (!sessionId) return
    try {
      await brainstormStore.loadSession(sessionId)
    } catch (error) {
      console.warn('[BrainstormTodoList] Failed to load brainstorm session state:', error)
    }
  },
  { immediate: true }
)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div
    v-if="sessionId && isBrainstormMode"
    class="brainstorm-todos"
    :class="{ 'brainstorm-todos--collapsed': isCollapsed }"
  >
    <button
      class="brainstorm-todos__header"
      @click="toggleCollapse"
    >
      <EaIcon
        name="sparkles"
        :size="12"
      />
      <span class="brainstorm-todos__title">Todo</span>
      <span
        v-if="todos.length > 0"
        class="brainstorm-todos__count"
      >{{ completedCount }}/{{ todos.length }}</span>
      <EaIcon
        class="brainstorm-todos__chevron"
        name="chevron-down"
        :size="12"
      />
    </button>

    <div
      v-show="!isCollapsed"
      class="brainstorm-todos__list"
    >
      <div
        v-if="todos.length === 0"
        class="brainstorm-todos__empty"
      >
        暂无待办项
      </div>

      <div
        v-for="todo in todos"
        :key="todo.id"
        class="brainstorm-todo"
        :class="{ 'brainstorm-todo--completed': todo.status === 'completed' }"
      >
        <span class="brainstorm-todo__status">
          <EaIcon
            :name="todo.status === 'completed' ? 'check' : 'circle'"
            :size="11"
          />
        </span>

        <span class="brainstorm-todo__title">{{ todo.title }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.brainstorm-todos {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.brainstorm-todos__header {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.brainstorm-todos__header:hover {
  color: var(--color-text-primary);
  border-color: var(--color-primary-light);
  background: var(--color-surface);
}

.brainstorm-todos__title {
  font-weight: 500;
}

.brainstorm-todos__count {
  font-size: 10px;
  opacity: 0.8;
  margin-left: 2px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
}

.brainstorm-todos__chevron {
  transition: transform 0.15s ease;
  opacity: 0.6;
  margin-left: 2px;
}

.brainstorm-todos--collapsed .brainstorm-todos__chevron {
  transform: rotate(-90deg);
}

.brainstorm-todos__list {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 180px;
  max-width: 280px;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-2);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.brainstorm-todos__empty {
  font-size: 11px;
  color: var(--color-text-tertiary);
  padding: 4px 0;
}

.brainstorm-todo {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 11px;
  line-height: 1.3;
}

.brainstorm-todo--completed {
  opacity: 0.5;
}

.brainstorm-todo--completed .brainstorm-todo__title {
  text-decoration: line-through;
}

.brainstorm-todo__status {
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.brainstorm-todo--completed .brainstorm-todo__status {
  color: var(--color-success);
}

.brainstorm-todo__title {
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
