import { describe, expect, it } from 'vitest'
import { extractTodoSnapshotFromMessages } from './todoToolCall'
import type { Message } from '@/stores/message'

function createToolMessage(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? 'message-1',
    sessionId: 'session-1',
    requestId: 'request-1',
    role: 'assistant',
    messageType: 'tool_use',
    content: '',
    status: 'completed',
    seq: 0,
    createdAt: overrides.createdAt ?? '2026-07-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-01T00:00:00.000Z',
    ...overrides
  }
}

describe('extractTodoSnapshotFromMessages', () => {
  it('extracts todos from todowrite tool input', () => {
    const snapshot = extractTodoSnapshotFromMessages([
      createToolMessage({
        toolCallId: 'tool-1',
        toolName: 'todowrite',
        toolInput: JSON.stringify({
          todos: [
            { content: 'Design API', status: 'completed' },
            { content: 'Wire UI', status: 'in_progress' }
          ]
        })
      })
    ])

    expect(snapshot?.items.map(item => [item.content, item.status])).toEqual([
      ['Design API', 'completed'],
      ['Wire UI', 'in_progress']
    ])
  })

  it('extracts todos from JSON tool result', () => {
    const snapshot = extractTodoSnapshotFromMessages([
      createToolMessage({
        toolCallId: 'tool-1',
        toolName: 'update_plan',
        messageType: 'tool_result',
        toolResult: JSON.stringify({
          tasks: [
            { title: 'Implement reducer', done: true },
            { title: 'Run tests', done: false }
          ]
        })
      })
    ])

    expect(snapshot?.items.map(item => [item.content, item.status])).toEqual([
      ['Implement reducer', 'completed'],
      ['Run tests', 'pending']
    ])
  })

  it('merges tool_use metadata with a later tool_result top-level array', () => {
    const snapshot = extractTodoSnapshotFromMessages([
      createToolMessage({
        id: 'use',
        toolCallId: 'tool-1',
        toolName: 'todowrite',
        toolInput: '{}'
      }),
      createToolMessage({
        id: 'result',
        toolCallId: 'tool-1',
        toolName: undefined,
        messageType: 'tool_result',
        toolResult: JSON.stringify([
          { content: 'Explore project context', status: 'completed' },
          { content: 'Ask clarifying questions', status: 'in_progress' }
        ]),
        createdAt: '2026-07-01T00:00:01.000Z',
        updatedAt: '2026-07-01T00:00:01.000Z'
      })
    ])

    expect(snapshot?.items.map(item => [item.content, item.status])).toEqual([
      ['Explore project context', 'completed'],
      ['Ask clarifying questions', 'in_progress']
    ])
  })

  it('prefers the latest merged tool_use result snapshot', () => {
    const snapshot = extractTodoSnapshotFromMessages([
      createToolMessage({
        id: 'old',
        toolCallId: 'tool-old',
        toolName: 'todowrite',
        toolInput: JSON.stringify({ todos: [{ content: 'Old task' }] })
      }),
      createToolMessage({
        id: 'new',
        toolCallId: 'tool-new',
        toolName: 'todowrite',
        toolInput: JSON.stringify({ todos: [{ content: 'Input task' }] }),
        toolResult: JSON.stringify({
          items: [{ content: 'Result task', status: 'done' }]
        }),
        createdAt: '2026-07-01T00:00:01.000Z',
        updatedAt: '2026-07-01T00:00:01.000Z'
      })
    ])

    expect(snapshot?.items.map(item => [item.content, item.status])).toEqual([
      ['Result task', 'completed']
    ])
  })
})
