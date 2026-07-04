import type { AcpSessionInfo, AcpReplayedEvent } from '@/types/cliSessionManager'

interface RelativeTimeLabels {
  justNow: string
  minutesAgo: (minutes: number) => string
  hoursAgo: (hours: number) => string
  daysAgo: (days: number) => string
}

interface EventDisplayFallbackLabels {
  noContent: string
  toolCall: string
  toolResult: string
  usage: string
}

export function formatCliRelativeTime(value: string, labels: RelativeTimeLabels): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return labels.justNow
  if (diffMins < 60) return labels.minutesAgo(diffMins)
  if (diffHours < 24) return labels.hoursAgo(diffHours)
  if (diffDays < 7) return labels.daysAgo(diffDays)

  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatCliTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

/** 显示会话标题（旧 first_message → 新 title） */
export function displayCliSessionMessage(session: AcpSessionInfo, noPreview: string): string {
  return session.title || noPreview
}

/** 格式化消息数量，可能为 null */
export function formatCliMessageCount(value: number | null): string {
  if (value === null || value === undefined) return '-'
  return value >= 0 ? String(value) : '-'
}

export function shortenCliSessionId(sessionId: string): string {
  return sessionId.length > 8 ? `${sessionId.slice(0, 8)}...` : sessionId
}

export function getCliProjectName(path: string, noProjectLabel: string): string {
  if (path === noProjectLabel) {
    return path
  }
  return path.split('/').pop() || path.split('\\').pop() || path
}

/** 获取事件类型的图标名称 */
export function getCliMessageIcon(type: string) {
  switch (type) {
    case 'user_message': return 'user'
    case 'agent_message': return 'bot'
    case 'agent_thought': return 'brain'
    case 'tool_call': return 'wrench'
    case 'tool_result': return 'terminal'
    case 'usage': return 'activity'
    default: return 'message-square'
  }
}

/** 获取事件类型的颜色 */
export function getCliMessageColor(type: string) {
  switch (type) {
    case 'user_message': return 'var(--color-primary)'
    case 'agent_message': return 'var(--color-success)'
    case 'agent_thought': return 'var(--color-warning)'
    case 'tool_call': return 'var(--color-primary)'
    case 'tool_result': return 'var(--color-success)'
    case 'usage': return 'var(--color-warning)'
    default: return 'var(--color-text-secondary)'
  }
}

/** 判断事件是否为用户消息 */
export function isUserEvent(event: AcpReplayedEvent): boolean {
  return event.eventType === 'user_message' || event.role === 'user'
}

/** 判断事件是否为 Agent 消息 */
export function isAgentEvent(event: AcpReplayedEvent): boolean {
  return event.eventType === 'agent_message' || event.role === 'assistant'
}

/** 获取事件的展示文本内容 */
export function getCliMessageDisplayContent(
  event: AcpReplayedEvent,
  labels: EventDisplayFallbackLabels
): string {
  // 工具调用：展示工具名 + 输入
  if (event.eventType === 'tool_call') {
    if (event.toolInput?.trim()) {
      return event.toolInput
    }
    return `${labels.toolCall}${event.toolName ? ': ' + event.toolName : ''}`
  }

  // 工具结果
  if (event.eventType === 'tool_result') {
    if (event.toolResult?.trim()) {
      return event.toolResult
    }
    return labels.toolResult
  }

  // 用量信息
  if (event.eventType === 'usage') {
    const input = event.inputTokens ?? 0
    const output = event.outputTokens ?? 0
    if (input || output) {
      return `${labels.usage}: ${input} in / ${output} out`
    }
    return labels.usage
  }

  const content = event.content?.trim()
  if (content) {
    return content
  }

  return labels.noContent
}

/** 获取事件的折叠预览文本 */
export function getEventCollapsedPreview(
  event: AcpReplayedEvent,
  labels: EventDisplayFallbackLabels,
  noPreview: string
): string {
  const content = getCliMessageDisplayContent(event, labels)
  if (!content) {
    return noPreview
  }
  return content.replace(/\s+/g, ' ').trim()
}