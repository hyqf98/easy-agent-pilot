/**
 * 记忆库仓库归纳运行器。
 *
 * 以仓库目录为工作区跑 ACP agent，让其在仓库内：① 读电脑找外部数据 ② 调内置工具
 * 查询本应用对话历史（internalToolsEnabled）③ 直接改仓库文件。
 *
 * 复用 AgentExecutor（同 CompressionService.generateSummary 的执行骨架），不写消息库。
 */
import type { AgentConfig } from '@/stores/agent'
import type { Message } from '@/stores/message'
import { agentExecutor } from '@/services/conversation/AgentExecutor'
import { buildConversationMessages } from '@/services/conversation/buildConversationMessages'
import type { ConversationContext, StreamEvent } from '@/services/conversation/strategies/types'
import type { MemoryRepo } from '@/types/memoryRepo'

export interface RepoRunOptions {
  /** 仓库（提供 repoPath / systemPrompt / agentId / modelId / internalToolsEnabled）。 */
  repo: MemoryRepo
  /** 执行 agent（已解析）。 */
  agent: AgentConfig
  /** 本轮归纳指令（告诉 AI 做什么）。 */
  instruction: string
  /** 追加的系统提示词（可选，拼在仓库 systemPrompt 之后）。 */
  extraSystemPrompt?: string
  /** 模型 ID 覆盖（默认用仓库绑定或 agent 默认）。 */
  modelId?: string
}

export interface RepoRunCallbacks {
  onContent?: (content: string) => void
  onEvent?: (event: StreamEvent) => void
  onError?: (error: string) => void
}

/**
 * 执行一次仓库归纳。返回 agent 产出的完整文本内容。
 *
 * 内置工具通过 ACP 注入（internalToolsEnabled + repoId），agent 可自行调
 * query_conversation_history 查内部历史；工作区设为 repoPath，agent 可直接读写仓库文件。
 */
export class MemoryRepoRunner {
  /**
   * 运行归纳。流式回调 onContent（累计文本）/ onEvent（原始事件）；resolve 时产出完整文本。
   */
  async run(options: RepoRunOptions, callbacks: RepoRunCallbacks = {}): Promise<string> {
    const { repo, agent, instruction, extraSystemPrompt } = options

    const sessionId = `memory-repo-run-${repo.id}-${Date.now()}`
    const requestId = `repo-run-${crypto.randomUUID()}`

    const systemPromptParts: string[] = []
    if (repo.systemPrompt.trim()) {
      systemPromptParts.push(repo.systemPrompt.trim())
    }
    if (extraSystemPrompt?.trim()) {
      systemPromptParts.push(extraSystemPrompt.trim())
    }
    // 追加固定的工作说明，引导 agent 用仓库目录 + 内置工具
    systemPromptParts.push(DEFAULT_REPO_RUN_INSTRUCTIONS)

    const userMessage: Message = {
      id: `repo-run-user-${Date.now()}`,
      sessionId,
      requestId,
      role: 'user',
      messageType: 'text',
      content: instruction,
      status: 'completed',
      seq: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const messages = buildConversationMessages([userMessage], {
      sessionId,
      injectedSystemMessages: systemPromptParts
    })

    const context: ConversationContext = {
      sessionId,
      requestId,
      agent,
      messages,
      workingDirectory: repo.repoPath,
      executionMode: 'task_execution',
      responseMode: 'stream_text',
      modelId: options.modelId ?? repo.modelId ?? undefined,
      internalToolsEnabled: repo.internalToolsEnabled,
      repoId: repo.id
    }

    let accumulated = ''
    try {
      await agentExecutor.execute(context, (event) => {
        callbacks.onEvent?.(event)
        if (event.type === 'content' && event.content) {
          accumulated += event.content
          callbacks.onContent?.(accumulated)
        } else if (event.type === 'error' && event.error) {
          callbacks.onError?.(event.error)
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      callbacks.onError?.(message)
      throw error
    }

    return accumulated
  }
}

/** 单例。 */
export const memoryRepoRunner = new MemoryRepoRunner()

/** 追加给每次仓库运行的固定说明。 */
const DEFAULT_REPO_RUN_INSTRUCTIONS = [
  '你正在维护一个记忆库仓库（标准 Skills 包目录）。',
  '工作目录即该仓库，你可以直接读取/修改其中的文件（如 SKILL.md、references/、index.md）。',
  '如需本应用的对话历史，调用 query_conversation_history 工具按时间范围/项目查询。',
  '也可以自行读取本机其他数据源（编辑器会话、文件、命令输出）来归纳。',
  '完成后请更新仓库文件，并在回复中简要说明你新增/修改了哪些文件以及归纳要点。'
].join('\n')
