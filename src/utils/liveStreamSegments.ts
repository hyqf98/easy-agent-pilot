/** 流式消息分段（文本、思考、工具）合并与视图模型构建。 */
import { mergeStreamingText } from './mergeStreamingText'

export type LiveStreamSegmentKind = 'text' | 'thinking' | 'tool'

export interface LiveStreamSegment {
  id: string
  kind: LiveStreamSegmentKind
  content: string
  status: 'streaming' | 'completed'
  toolCallId?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
}

export type LiveStreamEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_start' }
  | { type: 'tool_use'; toolCallId: string; toolName: string; toolInput?: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; toolResult?: string }

export function reduceLiveStreamSegments(events: LiveStreamEvent[]): LiveStreamSegment[] {
  const segments: LiveStreamSegment[] = []
  let current: LiveStreamSegment | null = null

  const finalizeCurrent = () => {
    if (current) {
      current.status = 'completed'
      current = null
    }
  }

  const ensureSegment = (kind: 'text' | 'thinking') => {
    if (current?.kind === kind) {
      return current
    }

    finalizeCurrent()
    current = {
      id: `segment-${segments.length}`,
      kind,
      content: '',
      status: 'streaming'
    }
    segments.push(current)
    return current
  }

  for (const event of events) {
    if (event.type === 'content') {
      const segment = ensureSegment('text')
      segment.content = mergeStreamingText(segment.content, event.content)
      continue
    }

    if (event.type === 'thinking' || event.type === 'thinking_start') {
      const segment = ensureSegment('thinking')
      if (event.type === 'thinking') {
        segment.content = mergeStreamingText(segment.content, event.content)
      }
      continue
    }

    finalizeCurrent()

    if (event.type === 'tool_use') {
      const segment: LiveStreamSegment = {
        id: `segment-${segments.length}`,
        kind: 'tool',
        content: '',
        status: 'streaming',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        toolInput: event.toolInput
      }
      segments.push(segment)
      continue
    }

    const toolSegment = [...segments].reverse().find(segment =>
      segment.kind === 'tool' && segment.toolCallId === event.toolCallId
    )
    if (toolSegment) {
      toolSegment.toolResult = event.toolResult
      toolSegment.status = 'completed'
    }
  }

  finalizeCurrent()
  return segments
}
