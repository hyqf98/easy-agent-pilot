import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessageStore } from '@/stores/message'
import {
  extractTodoSnapshotFromMessages,
  sortTodoItems,
  type TodoItem,
  type TodoSnapshot
} from '@/utils/todoToolCall'
import { loadTodoSnapshot, saveTodoSnapshot } from '@/utils/todoPersistence'

export interface ConversationTodoPanelProps {
  sessionId: string | null | undefined
  defaultCollapsed?: boolean
}

export function useConversationTodoPanel(props: ConversationTodoPanelProps) {
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

  const messageDerivedSnapshot = computed<TodoSnapshot | null>(() => parseTodoSnapshot())

  // 消息派生的快照非空时持久化（供下次会话恢复兜底）
  watch(messageDerivedSnapshot, (snapshot) => {
    if (props.sessionId) {
      saveTodoSnapshot(props.sessionId, snapshot)
    }
  })

  // todoSnapshot：优先用消息派生（CLI 回放），为空时回退到 localStorage 兜底
  const todoSnapshot = computed<TodoSnapshot | null>(() => {
    if (messageDerivedSnapshot.value) {
      return messageDerivedSnapshot.value
    }
    // 消息中无 todo（可能 CLI 回放缺失），尝试从 localStorage 恢复
    if (props.sessionId) {
      return loadTodoSnapshot(props.sessionId)
    }
    return null
  })

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

  return {
    panelRef,
    isCollapsed,
    todoSnapshot,
    sortedTodoItems,
    activeTodoItems,
    hiddenActiveTodoCount,
    completedCount,
    formatStatusLabel,
    toggleCollapsed
  }
}
