import { agentExecutor } from '@/services/conversation/AgentExecutor'
import type { ConversationContext } from '@/services/conversation/strategies/types'
import type { AgentConfig } from '@/stores/agent'
import type { Message } from '@/stores/message'
import type { MemoryLibrary, RawMemoryRecord } from '@/types/memory'

interface MergeRequest {
  agent: AgentConfig
  library: MemoryLibrary
  records: RawMemoryRecord[]
}

function createMessage(role: Message['role'], content: string): Message {
  return {
    id: `memory-merge-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: `memory-merge-${Date.now()}`,
    role,
    content,
    status: 'completed',
    createdAt: new Date().toISOString()
  }
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function buildPrompt(library: MemoryLibrary, records: RawMemoryRecord[]): string {
  const serializedRecords = records
    .map((record, index) => {
      const meta = [
        record.projectName || '未关联项目',
        record.sessionName || '未关联会话',
        record.createdAt
      ].join(' / ')

      return [
        `### 原始记忆 ${index + 1}`,
        `来源: ${meta}`,
        record.content.trim()
      ].join('\n')
    })
    .join('\n\n')

  const currentContent = library.contentMd.trim() || '_当前记忆库为空，请根据新增原始记忆初始化内容。_'

  return [
    `你正在维护一个名为「${library.name}」的记忆库。`,
    library.description ? `记忆库说明：${library.description}` : '',
    '',
    '任务：把“当前记忆库 Markdown 内容”和“新增原始记忆”合并成一篇新的完整 Markdown 文档。',
    '要求：',
    '1. 输出必须是最终完整 Markdown，不要输出 JSON，不要解释，不要代码块包裹。',
    '2. 需要自动去重、归类、合并相近信息。',
    '3. 如果新旧信息冲突，优先保留更明确、更新的表述。',
    '4. 只保留对后续协作长期有价值的稳定信息，不要抄入一次性对话噪音。',
    '5. 保持结构清晰，适合人类直接阅读和后续继续追加。',
    '',
    '## 当前记忆库内容',
    currentContent,
    '',
    '## 新增原始记忆',
    serializedRecords
  ]
    .filter(Boolean)
    .join('\n')
}

export class MemoryMergeService {
  async mergeLibrary({ agent, library, records }: MergeRequest): Promise<string> {
    const messages: Message[] = [
      createMessage('system', '你是 Markdown 记忆库整理助手。你的输出只能是最终 Markdown 文档本身。'),
      createMessage('user', buildPrompt(library, records))
    ]

    const context: ConversationContext = {
      sessionId: `memory-merge-${Date.now()}`,
      agent,
      messages,
      executionMode: 'chat',
      responseMode: 'stream_text'
    }

    let output = ''
    let failure: string | null = null

    await agentExecutor.execute(context, (event) => {
      if (event.type === 'content' && event.content) {
        output += event.content
      }
      if (event.type === 'error' && event.error) {
        failure = event.error
      }
    })

    if (failure) {
      throw new Error(failure)
    }

    const mergedContent = stripCodeFence(output)
    if (!mergedContent.trim()) {
      throw new Error('AI 未返回可用的记忆库 Markdown 内容')
    }

    return mergedContent.trim()
  }
}

export const memoryMergeService = new MemoryMergeService()
