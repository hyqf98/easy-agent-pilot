import type { Message, ToolCall } from '@/stores/message'

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface TodoSnapshot {
  items: TodoItem[]
  updatedAt: string
}

const TODO_TOOL_NAMES = new Set([
  'todowrite',
  'todo.write',
  'todo_write',
  'todowriteitems',
  'todo_list',
  'todo-list',
  'update_plan',
  'functions.update_plan'
])

const IN_PROGRESS_STATUSES = new Set([
  'in_progress',
  'in-progress',
  'running',
  'active',
  'processing',
  'doing'
])

const COMPLETED_STATUSES = new Set([
  'completed',
  'complete',
  'done',
  'success',
  'succeeded',
  'finished'
])

const TODO_SNAPSHOT_MESSAGES_CACHE_LIMIT = 120

function normalizeToolName(name: string | undefined): string {
  return name?.trim().toLowerCase() ?? ''
}

function normalizeTodoStatus(value: unknown): TodoItem['status'] {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase()
    : ''

  if (COMPLETED_STATUSES.has(normalized)) {
    return 'completed'
  }

  if (IN_PROGRESS_STATUSES.has(normalized)) {
    return 'in_progress'
  }

  return 'pending'
}

function resolveTodoStatus(entry: Record<string, unknown>): TodoItem['status'] {
  if (typeof entry.completed === 'boolean') {
    return entry.completed ? 'completed' : 'pending'
  }

  if (typeof entry.done === 'boolean') {
    return entry.done ? 'completed' : 'pending'
  }

  return normalizeTodoStatus(entry.status)
}

function resolveTodoArray(toolCall: ToolCall): unknown[] {
  const candidates = [
    parseTodoResultPayload(toolCall.result),
    toolCall.arguments?.todos,
    toolCall.arguments?.items,
    toolCall.arguments?.tasks,
    toolCall.arguments?.plan
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return []
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseTodoResultPayload(value: unknown): unknown[] | undefined {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
  }

  const parsedObject = parsed && typeof parsed === 'object'
    ? parsed as Record<string, unknown>
    : null

  if (!parsedObject) {
    return undefined
  }

  const candidate = [
    parsedObject.todos,
    parsedObject.items,
    parsedObject.tasks,
    parsedObject.plan
  ].find(Array.isArray)

  return Array.isArray(candidate) ? candidate : undefined
}

function resolveTodoContent(entry: Record<string, unknown>): string {
  const value = [
    entry.content,
    entry.step,
    entry.title,
    entry.text,
    entry.task,
    entry.name
  ].find(item => typeof item === 'string' && item.trim().length > 0)

  return typeof value === 'string' ? value.trim() : ''
}

function parseToolCallTodos(toolCall: ToolCall): TodoItem[] {
  const items = resolveTodoArray(toolCall)

  return items.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const entry = item as Record<string, unknown>
    const content = resolveTodoContent(entry)
    if (!content) {
      return []
    }

    return [{
      id: `${toolCall.id}-${index}`,
      content,
      status: resolveTodoStatus(entry),
      activeForm: typeof entry.activeForm === 'string' ? entry.activeForm.trim() : undefined
    }]
  })
}

function buildMessagesTodoCacheKey(messages: Message[]): string {
  const lastMessage = messages[messages.length - 1]
  const lastToolMessage = [...messages].reverse().find(message =>
    message.messageType === 'tool_use' || message.messageType === 'tool_result'
  )

  return [
    messages.length,
    lastMessage?.id ?? '',
    lastMessage?.status ?? '',
    lastMessage?.createdAt ?? '',
    lastMessage?.messageType ?? '',
    lastToolMessage?.id ?? '',
    lastToolMessage?.status ?? '',
    lastToolMessage?.toolInput?.length ?? 0,
    lastToolMessage?.toolResult?.length ?? 0
  ].join(':')
}

const todoSnapshotByMessagesCache = new Map<string, TodoSnapshot | null>()

function setTodoSnapshotCache(key: string, snapshot: TodoSnapshot | null): void {
  todoSnapshotByMessagesCache.set(key, snapshot)
  if (todoSnapshotByMessagesCache.size > TODO_SNAPSHOT_MESSAGES_CACHE_LIMIT) {
    const oldestKey = todoSnapshotByMessagesCache.keys().next().value
    if (oldestKey) {
      todoSnapshotByMessagesCache.delete(oldestKey)
    }
  }
}

export function extractTodoSnapshotFromToolCalls(
  toolCalls: ToolCall[],
  updatedAt: string
): TodoSnapshot | null {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index]
    if (!TODO_TOOL_NAMES.has(normalizeToolName(toolCall.name))) {
      continue
    }

    const items = parseToolCallTodos(toolCall)
    if (items.length > 0) {
      return {
        items,
        updatedAt
      }
    }
  }

  return null
}

export function extractTodoSnapshotFromMessages(messages: Message[]): TodoSnapshot | null {
  if (messages.length === 0) {
    return null
  }

  const cacheKey = buildMessagesTodoCacheKey(messages)
  if (todoSnapshotByMessagesCache.has(cacheKey)) {
    return todoSnapshotByMessagesCache.get(cacheKey) ?? null
  }

  const toolUseByCallId = new Map<string, Message>()
  for (const message of messages) {
    if (message.messageType === 'tool_use' && message.toolCallId) {
      toolUseByCallId.set(message.toolCallId, message)
    }
  }

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message.messageType !== 'tool_use' && message.messageType !== 'tool_result') {
      continue
    }

    const toolUseMessage = message.messageType === 'tool_result' && message.toolCallId
      ? toolUseByCallId.get(message.toolCallId)
      : undefined
    const toolName = message.toolName || toolUseMessage?.toolName
    const toolInput = message.toolInput || toolUseMessage?.toolInput
    let parsedArguments: Record<string, unknown> = {}
    if (toolInput) {
      parsedArguments = parseJsonObject(toolInput) ?? { raw: toolInput }
    }

    const snapshot = extractTodoSnapshotFromToolCalls(
      [{
        id: message.toolCallId ?? '',
        name: toolName ?? '',
        arguments: parsedArguments,
        status: message.status === 'error' ? 'error' : 'success',
        result: message.toolResult
      }],
      message.createdAt
    )
    if (snapshot) {
      setTodoSnapshotCache(cacheKey, snapshot)
      return snapshot
    }
  }

  setTodoSnapshotCache(cacheKey, null)
  return null
}

export function sortTodoItems(items: TodoItem[]): TodoItem[] {
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
}
