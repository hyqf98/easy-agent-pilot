<script setup lang="ts">
import { computed, watch } from 'vue'
import { useBrainstormStore } from '@/stores/brainstorm'
import { EaIcon } from '@/components/common'
import type { BrainstormTodo } from '@/types/brainstorm'

const props = defineProps<{
  sessionId: string | null
}>()

const brainstormStore = useBrainstormStore()

const isBrainstormMode = computed(() => {
  if (!props.sessionId) return false
  return brainstormStore.getSessionMode(props.sessionId) === 'brainstorm'
})

const todos = computed(() => {
  if (!props.sessionId) return []
  return brainstormStore.getSessionTodos(props.sessionId)
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

async function toggleTodo(todo: BrainstormTodo) {
  if (!props.sessionId) return
  const nextStatus = todo.status === 'completed' ? 'pending' : 'completed'
  await brainstormStore.applyTodoOps(props.sessionId, [
    {
      op: 'update',
      id: todo.id,
      status: nextStatus
    }
  ])
}

async function removeTodo(todo: BrainstormTodo) {
  if (!props.sessionId) return
  await brainstormStore.applyTodoOps(props.sessionId, [
    {
      op: 'remove',
      id: todo.id
    }
  ])
}
</script>

<template>
  <div
    v-if="sessionId && isBrainstormMode"
    class="brainstorm-todos"
  >
    <div class="brainstorm-todos__header">
      <EaIcon
        name="sparkles"
        :size="12"
      />
      <span>当前会话 Todo</span>
    </div>

    <div class="brainstorm-todos__list">
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
        <button
          class="brainstorm-todo__checkbox"
          :title="todo.status === 'completed' ? '标记为未完成' : '标记为完成'"
          @click="toggleTodo(todo)"
        >
          <EaIcon
            :name="todo.status === 'completed' ? 'check-circle' : 'circle'"
            :size="12"
          />
        </button>

        <div class="brainstorm-todo__content">
          <div class="brainstorm-todo__title">
            {{ todo.title }}
          </div>
          <div
            v-if="todo.description"
            class="brainstorm-todo__desc"
          >
            {{ todo.description }}
          </div>
        </div>

        <button
          class="brainstorm-todo__remove"
          title="删除"
          @click="removeTodo(todo)"
        >
          <EaIcon
            name="x"
            :size="11"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.brainstorm-todos {
  margin-top: var(--spacing-1);
  padding: var(--spacing-2) var(--spacing-2) var(--spacing-1);
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.brainstorm-todos__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-normal);
}

.brainstorm-todos__list {
  max-height: 228px; /* compact default: ~6 rows */
  overflow-y: auto;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.brainstorm-todos__empty {
  font-size: 11px;
  color: var(--color-text-tertiary);
  padding: 2px 0;
}

.brainstorm-todo {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-bg-secondary) 85%, transparent);
}

.brainstorm-todo--completed {
  opacity: 0.68;
}

.brainstorm-todo__checkbox,
.brainstorm-todo__remove {
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brainstorm-todo__checkbox:hover,
.brainstorm-todo__remove:hover {
  color: var(--color-text-primary);
}

.brainstorm-todo__content {
  min-width: 0;
  flex: 1;
}

.brainstorm-todo__title {
  font-size: 11px;
  color: var(--color-text-primary);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brainstorm-todo--completed .brainstorm-todo__title {
  text-decoration: line-through;
}

.brainstorm-todo__desc {
  margin-top: 1px;
  font-size: 10px;
  color: var(--color-text-tertiary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
