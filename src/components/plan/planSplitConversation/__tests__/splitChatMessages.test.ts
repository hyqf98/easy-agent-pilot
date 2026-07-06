import { describe, expect, it } from 'vitest'
import { buildTurnAssistantMessages } from '../splitChatMessages'
import type { PlanSplitLogRecord } from '@/types/plan'

// —— 测试 fixtures ——

function makeLog(
  type: PlanSplitLogRecord['type'],
  content: string,
  overrides: Partial<PlanSplitLogRecord> = {}
): PlanSplitLogRecord {
  return {
    id: `log-${Math.random().toString(36).slice(2, 8)}`,
    planId: 'plan-1',
    sessionId: 'turn-session-1',
    type,
    content,
    metadata: null,
    createdAt: '2026-07-06T10:00:00.000Z',
    ...overrides
  }
}

const defaultOptions = {
  sessionId: 'split-chat-1',
  requestId: 'split-turn-1',
  startSeq: 0,
  isRunning: false,
  normalizeContent: (raw: string) => raw,
  isEnvironmentSystemContent: () => false
}

describe('buildTurnAssistantMessages', () => {
  describe('content 合并', () => {
    it('连续 content chunks 合并为一条 text Message', () => {
      const logs = [
        makeLog('content', '任务1：'),
        makeLog('content', '搭建项目结构'),
        makeLog('content', '。')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageType).toBe('text')
      expect(result.messages[0].content).toBe('任务1：搭建项目结构。')
    })

    it('空 content 不产生消息', () => {
      const logs = [makeLog('content', ''), makeLog('content', '   ')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(0)
      expect(result.hasAssistantPayload).toBe(false)
    })

    it('normalizeContent 回调被调用（如 markdown 处理）', () => {
      const logs = [makeLog('content', '# 标题')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, {
        ...defaultOptions,
        normalizeContent: (raw) => `[processed]${raw}`
      })
      expect(result.messages[0].content).toBe('[processed]# 标题')
    })
  })

  describe('tool_use / tool_result 独立成行', () => {
    it('tool_use 产生独立的 tool_use Message（带 toolCallId/toolName/toolInput）', () => {
      const logs = [
        makeLog('tool_use', '{"path":"src/index.ts"}', {
          metadata: JSON.stringify({
            toolCallId: 'tc-1',
            toolName: 'read_file',
            toolInput: '{"path":"src/index.ts"}',
            toolKind: 'read'
          })
        })
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      const msg = result.messages[0]
      expect(msg.messageType).toBe('tool_use')
      expect(msg.toolCallId).toBe('tc-1')
      expect(msg.toolName).toBe('read_file')
      expect(msg.toolInput).toBe('{"path":"src/index.ts"}')
      expect(msg.toolKind).toBe('read')
    })

    it('tool_result 产生独立的 tool_result Message（带 toolCallId/toolResult）', () => {
      const logs = [
        makeLog('tool_use', '{"path":"README.md"}', {
          metadata: JSON.stringify({ toolCallId: 'tc-2', toolName: 'read_file' })
        }),
        makeLog('tool_result', '文件内容...', {
          metadata: JSON.stringify({ toolCallId: 'tc-2' })
        })
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].messageType).toBe('tool_use')
      expect(result.messages[1].messageType).toBe('tool_result')
      expect(result.messages[1].toolCallId).toBe('tc-2')
      expect(result.messages[1].toolResult).toBe('文件内容...')
      expect(result.messages[1].toolName).toBe('read_file')
    })

    it('tool_result 无 toolCallId 时 fallback 到最近的 running tool_use', () => {
      const logs = [
        makeLog('tool_use', '{}', {
          metadata: JSON.stringify({ toolCallId: 'tc-3', toolName: 'write_file' })
        }),
        makeLog('tool_result', '写入成功', { metadata: null })
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages[1].toolCallId).toBe('tc-3')
    })

    it('tool_result 缺少 toolCallId 且无 running tool 时仍独立成行', () => {
      const logs = [makeLog('tool_result', '孤儿结果', { metadata: null })]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageType).toBe('tool_result')
      expect(result.messages[0].toolResult).toBe('孤儿结果')
    })
  })

  describe('thinking 独立成行', () => {
    it('thinking 事件产生独立的 thinking Message', () => {
      const logs = [
        makeLog('thinking', '分析需求...'),
        makeLog('thinking', '决定拆分方案')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageType).toBe('thinking')
      expect(result.messages[0].content).toBe('分析需求...\n\n决定拆分方案')
    })

    it('thinking_start 事件被跳过（不产生消息）', () => {
      const logs = [makeLog('thinking_start', '')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('seq 递增 + 顺序稳定', () => {
    it('所有 Message 的 seq 严格递增', () => {
      const logs = [
        makeLog('thinking', '思考'),
        makeLog('content', '回答'),
        makeLog('tool_use', '{}', { metadata: JSON.stringify({ toolCallId: 'tc-1', toolName: 'bash' }) }),
        makeLog('tool_result', 'done', { metadata: JSON.stringify({ toolCallId: 'tc-1' }) }),
        makeLog('content', '结论')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, {
        ...defaultOptions,
        startSeq: 10
      })
      const seqs = result.messages.map(m => m.seq)
      expect(seqs).toEqual([10, 11, 12, 13, 14])
    })

    it('同毫秒时间戳的事件顺序保持稳定（不依赖 createdAt 排序）', () => {
      const sameTimestamp = '2026-07-06T10:00:00.123Z'
      const logs = [
        makeLog('content', '第一段', { createdAt: sameTimestamp }),
        makeLog('tool_use', '{}', { createdAt: sameTimestamp, metadata: JSON.stringify({ toolCallId: 'tc-a', toolName: 'ls' }) }),
        makeLog('tool_result', '结果A', { createdAt: sameTimestamp, metadata: JSON.stringify({ toolCallId: 'tc-a' }) }),
        makeLog('content', '第二段', { createdAt: sameTimestamp })
      ]
      // 跑 5 次，验证顺序始终一致（不随机）
      for (let run = 0; run < 5; run++) {
        const result = buildTurnAssistantMessages([...logs], sameTimestamp, undefined, defaultOptions)
        const types = result.messages.map(m => m.messageType)
        // 期望顺序：text(第一段) → tool_use → tool_result → text(第二段)
        expect(types).toEqual(['text', 'tool_use', 'tool_result', 'text'])
        expect(result.messages[0].content).toBe('第一段')
        expect(result.messages[3].content).toBe('第二段')
      }
    })

    it('乱序输入的 logs 仍按原始数组顺序处理（不重新 sort）', () => {
      // 注意：buildTurnAssistantMessages 不做 sort，按 turnLogs 数组顺序遍历
      // 这是正确行为 —— 外层 splitChatMessages 已按 seq 维护顺序
      const logs = [
        makeLog('tool_result', '结果', { id: 'log-r', metadata: JSON.stringify({ toolCallId: 'tc-x' }) }),
        makeLog('tool_use', '{}', { id: 'log-u', metadata: JSON.stringify({ toolCallId: 'tc-x', toolName: 'grep' }) })
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      // tool_result 在前（按输入顺序），tool_use 在后
      expect(result.messages[0].messageType).toBe('tool_result')
      expect(result.messages[1].messageType).toBe('tool_use')
    })
  })

  describe('error 独立成行', () => {
    it('error 事件产生独立的 error Message', () => {
      const logs = [makeLog('error', 'CLI 执行超时')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageType).toBe('error')
      expect(result.messages[0].status).toBe('error')
      expect(result.messages[0].errorMessage).toBe('CLI 执行超时')
      expect(result.assistantStatus).toBe('error')
      expect(result.assistantErrorMessage).toBe('CLI 执行超时')
    })

    it('error 后的 content 仍会被渲染（status 继承 error）', () => {
      const logs = [
        makeLog('error', '部分失败'),
        makeLog('content', '已完成的部分输出')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages.length).toBeGreaterThanOrEqual(2)
      expect(result.messages.some(m => m.messageType === 'error')).toBe(true)
      expect(result.messages.some(m => m.messageType === 'text')).toBe(true)
    })
  })

  describe('system 事件', () => {
    it('普通 system 内容产生 system Message', () => {
      const logs = [makeLog('system', '会话已恢复')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageType).toBe('system')
      expect(result.messages[0].content).toBe('会话已恢复')
    })

    it('环境运行时通知被 isEnvironmentSystemContent 过滤', () => {
      const logs = [makeLog('system', '环境：Node.js v20')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, {
        ...defaultOptions,
        isEnvironmentSystemContent: (content) => content.startsWith('环境：')
      })
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('跳过的事件类型', () => {
    it('usage / message_start / tool_input_delta 被跳过', () => {
      const logs = [
        makeLog('usage', '{"input":100}'),
        makeLog('message_start', ''),
        makeLog('tool_input_delta', '{"partial":true}'),
        makeLog('content', '实际内容')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageType).toBe('text')
    })
  })

  describe('streaming 状态', () => {
    it('isRunning=true 时最后一条 Message 标记为 streaming', () => {
      const logs = [makeLog('content', '流式输出中...')]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, {
        ...defaultOptions,
        isRunning: true
      })
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].status).toBe('streaming')
      expect(result.assistantStatus).toBe('streaming')
    })

    it('isRunning=true 但有 error 时最后一条不标记 streaming', () => {
      const logs = [
        makeLog('error', '失败'),
        makeLog('content', '部分内容')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, {
        ...defaultOptions,
        isRunning: true
      })
      expect(result.assistantStatus).toBe('error')
    })
  })

  describe('复杂场景：完整一轮 ACP 响应', () => {
    it('thinking → content → tool_use → tool_result → content 的完整序列', () => {
      const logs = [
        makeLog('thinking', '用户要拆分认证系统'),
        makeLog('content', '我来分析需求并拆分任务。'),
        makeLog('tool_use', '{"path":"package.json"}', {
          metadata: JSON.stringify({ toolCallId: 'tc-read', toolName: 'read_file', toolKind: 'read' })
        }),
        makeLog('tool_result', '{"name":"auth-system"}', {
          metadata: JSON.stringify({ toolCallId: 'tc-read' })
        }),
        makeLog('content', '## 任务拆分结果\n1. 项目初始化\n2. 数据库设计')
      ]
      const result = buildTurnAssistantMessages(logs, '2026-07-06T10:00:00.000Z', undefined, defaultOptions)

      // 应产生 5 条 Message：thinking + text + tool_use + tool_result + text
      expect(result.messages).toHaveLength(5)
      const types = result.messages.map(m => m.messageType)
      expect(types).toEqual(['thinking', 'text', 'tool_use', 'tool_result', 'text'])

      // seq 严格递增
      expect(result.messages.map(m => m.seq)).toEqual([0, 1, 2, 3, 4])

      // 所有 Message 共享同一 requestId（同回合）
      expect(result.messages.every(m => m.requestId === 'split-turn-1')).toBe(true)

      // 最后一条是任务拆分结果文本
      expect(result.messages[4].content).toContain('任务拆分结果')

      // hasAssistantPayload 为 true
      expect(result.hasAssistantPayload).toBe(true)
    })
  })
})
