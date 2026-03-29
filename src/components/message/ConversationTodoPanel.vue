<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EaIcon } from '@/components/common'
import { useMessageStore, type ToolCall } from '@/stores/message'

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

interface TodoSnapshot {
  source: 'claude' | 'codex'
  items: TodoItem[]
  updatedAt: string
}

const props = defineProps<{
  sessionId: string | null | undefined
  defaultCollapsed?: boolean
}>()

const messageStore = useMessageStore()
const isCollapsed = ref(props.defaultCollapsed ?? true)

watch(() => props.sessionId, () => {
  isCollapsed.value = props.defaultCollapsed ?? true
})

function normalizeTodoStatus(value: unknown): TodoItem['status'] {
  if (value === 'completed') {
    return 'completed'
  }
  if (value === 'in_progress') {
    return 'in_progress'
  }
  return 'pending'
}

function parseClaudeTodos(toolCall: ToolCall): TodoItem[] {
  const todos = Array.isArray(toolCall.arguments?.todos) ? toolCall.arguments.todos : []
  return todos.flatMap((todo, index) => {
    if (!todo || typeof todo !== 'object') {
      return []
    }

    const entry = todo as Record<string, unknown>
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    if (!content) {
      return []
    }

    return [{
      id: `${toolCall.id}-${index}`,
      content,
      status: normalizeTodoStatus(entry.status),
      activeForm: typeof entry.activeForm === 'string' ? entry.activeForm.trim() : undefined
    }]
  })
}

function parseCodexPlan(toolCall: ToolCall): TodoItem[] {
  const plan = Array.isArray(toolCall.arguments?.plan) ? toolCall.arguments.plan : []
  return plan.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const entry = item as Record<string, unknown>
    const content = typeof entry.step === 'string' ? entry.step.trim() : ''
    if (!content) {
      return []
    }

    return [{
      id: `${toolCall.id}-${index}`,
      content,
      status: normalizeTodoStatus(entry.status)
    }]
  })
}

function parseTodoSnapshot(): TodoSnapshot | null {
  if (!props.sessionId) {
    return null
  }

  const messages = messageStore.messagesBySession(props.sessionId)

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    const toolCalls = message.toolCalls ?? []

    for (let toolIndex = toolCalls.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolCall = toolCalls[toolIndex]
      const normalizedName = toolCall.name.trim().toLowerCase()

      if (normalizedName === 'todowrite') {
        const items = parseClaudeTodos(toolCall)
        if (items.length > 0) {
          return {
            source: 'claude',
            items,
            updatedAt: message.createdAt
          }
        }
      }

      if (normalizedName === 'update_plan' || normalizedName === 'functions.update_plan') {
        const items = parseCodexPlan(toolCall)
        if (items.length > 0) {
          return {
            source: 'codex',
            items,
            updatedAt: message.createdAt
          }
        }
      }
    }
  }

  return null
}

const todoSnapshot = computed(() => parseTodoSnapshot())

const sortedTodoItems = computed(() => {
  const items = todoSnapshot.value?.items ?? []
  const weight = (status: TodoItem['status']) => {
    switch (status) {
      case 'in_progress':
        return 0
      case 'pending':
        return 1
      default:
        return 2
    }
  }

  return [...items].sort((left, right) => weight(left.status) - weight(right.status))
})

const completedCount = computed(() =>
  sortedTodoItems.value.filter(item => item.status === 'completed').length
)

const formatStatusLabel = (status: TodoItem['status']) => {
  switch (status) {
    case 'in_progress':
      return '进行中'
    case 'completed':
      return '已完成'
    default:
      return '待处理'
  }
}

const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <section
    v-if="todoSnapshot && sortedTodoItems.length > 0"
    class="conversation-todo-panel"
  >
    <button
      type="button"
      class="conversation-todo-panel__head"
      :aria-expanded="!isCollapsed"
      @click="toggleCollapsed"
    >
      <div class="conversation-todo-panel__title">
        <EaIcon
          name="list-todo"
          :size="14"
        />
        <span>待办列表</span>
        <span class="conversation-todo-panel__source">
          {{ todoSnapshot.source === 'claude' ? 'Claude TodoWrite' : 'Codex update_plan' }}
        </span>
      </div>
      <div class="conversation-todo-panel__summary">
        {{ completedCount }}/{{ sortedTodoItems.length }}
        <EaIcon
          :name="isCollapsed ? 'chevron-down' : 'chevron-up'"
          :size="14"
        />
      </div>
    </button>

    <div class="conversation-todo-panel__items">
      <div v-show="!isCollapsed">
        <div
          v-for="item in sortedTodoItems"
          :key="item.id"
          class="conversation-todo-panel__item"
          :class="`conversation-todo-panel__item--${item.status}`"
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
  margin: 10px 16px 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-border-primary) 72%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 92%, white 8%), var(--color-bg-primary));
}

.conversation-todo-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  margin-bottom: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
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

.conversation-todo-panel__source,
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
  gap: 8px;
}

.conversation-todo-panel__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, transparent);
}

.conversation-todo-panel__item--in_progress {
  background: color-mix(in srgb, #22c55e 14%, var(--color-bg-secondary));
}

.conversation-todo-panel__item--pending {
  background: color-mix(in srgb, #f59e0b 12%, var(--color-bg-secondary));
}

.conversation-todo-panel__item--completed {
  opacity: 0.86;
}

.conversation-todo-panel__dot {
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
}
</style>
