import { describe, expect, it } from 'vitest'
import { reduceLiveStreamSegments } from './liveStreamSegments'

describe('reduceLiveStreamSegments', () => {
  it('keeps ACP event order while merging consecutive same-kind segments', () => {
    const segments = reduceLiveStreamSegments([
      { type: 'thinking', content: 'think 1' },
      { type: 'tool_use', toolCallId: 'tool-1', toolName: 'read', toolInput: { path: 'a.ts' } },
      { type: 'tool_result', toolCallId: 'tool-1', toolResult: 'ok' },
      { type: 'thinking', content: 'think 2' },
      { type: 'content', content: 'hello ' },
      { type: 'content', content: 'world' },
      { type: 'tool_use', toolCallId: 'tool-2', toolName: 'write', toolInput: { path: 'b.ts' } },
      { type: 'content', content: 'done' }
    ])

    expect(segments.map(segment => segment.kind)).toEqual([
      'thinking',
      'tool',
      'thinking',
      'text',
      'tool',
      'text'
    ])
    expect(segments[3]?.content).toBe('hello world')
    expect(segments[1]).toMatchObject({
      toolCallId: 'tool-1',
      toolResult: 'ok',
      status: 'completed'
    })
  })

  it('opens a new text segment after thinking or tool interruption', () => {
    const segments = reduceLiveStreamSegments([
      { type: 'content', content: 'a' },
      { type: 'content', content: 'b' },
      { type: 'thinking_start' },
      { type: 'thinking', content: 'c' },
      { type: 'content', content: 'd' },
      { type: 'tool_use', toolCallId: 'tool-1', toolName: 'task' },
      { type: 'content', content: 'e' }
    ])

    expect(segments.map(segment => [segment.kind, segment.content])).toEqual([
      ['text', 'ab'],
      ['thinking', 'c'],
      ['text', 'd'],
      ['tool', ''],
      ['text', 'e']
    ])
  })
})
