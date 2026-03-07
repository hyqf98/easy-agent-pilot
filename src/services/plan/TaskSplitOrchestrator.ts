import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import type { ExecutionRequest } from '@/services/conversation/strategies/types'

export interface SplitChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ExecuteTurnParams {
  agent: AgentConfig
  modelId: string
  workingDirectory?: string
  messages: SplitChatMessage[]
  systemPrompt?: string
  cliOutputFormat?: 'text' | 'json' | 'stream-json'
  jsonSchema?: string
  extraCliArgs?: string[]
  executionMode?: 'chat' | 'task_split'
  responseMode?: 'stream_text' | 'json_once'
  onContent: (delta: string) => void
}

interface StreamPayload {
  type: string
  session_id?: string
  content?: string
  error?: string
}

export class TaskSplitOrchestrator {
  private activeSessionId: string | null = null
  private activeAgentType: string | null = null
  private activeUnlisten: UnlistenFn | null = null

  async executeTurn(params: ExecuteTurnParams): Promise<string> {
    const {
      agent,
      modelId,
      workingDirectory,
      messages,
      systemPrompt,
      cliOutputFormat,
      jsonSchema,
      extraCliArgs,
      executionMode,
      responseMode,
      onContent
    } = params
    const provider = agent.provider || 'claude'
    const sessionId = crypto.randomUUID()

    // 先设置 activeSessionId，再调用 getEventName
    this.activeSessionId = sessionId
    this.activeAgentType = agent.type
    const eventName = this.getEventName(agent.type, provider)

    let fullContent = ''
    const streamErrors: string[] = []

    const request: ExecutionRequest = {
      sessionId,
      agentType: agent.type as 'cli' | 'sdk',
      provider,
      messages,
      modelId: modelId || undefined,
      workingDirectory,
      systemPrompt,
      maxTokens: agent.type === 'sdk' ? 4096 : undefined,
      executionMode: executionMode ?? 'task_split',
      responseMode: responseMode ?? 'json_once'
    }

    if (agent.type === 'cli') {
      if (!agent.cliPath) {
        throw new Error('CLI 路径未配置')
      }
      request.cliPath = agent.cliPath
      request.allowedTools = this.getAllowedTools(provider)
      request.cliOutputFormat = cliOutputFormat
      request.jsonSchema = jsonSchema
      request.extraCliArgs = extraCliArgs
    } else {
      if (!agent.apiKey) {
        throw new Error('SDK API Key 未配置')
      }
      request.apiKey = agent.apiKey
      request.baseUrl = agent.baseUrl
    }

    this.activeUnlisten = await listen<StreamPayload>(eventName, (event) => {
      const payload = event.payload
      if (payload.type === 'content' && payload.content) {
        fullContent += payload.content
        onContent(payload.content)
      } else if (payload.type === 'error' && payload.error) {
        streamErrors.push(payload.error)
      }
    })
    try {
      await invoke('execute_agent', { request })

      // 等待事件循环处理完所有待处理的事件
      // 这是为了确保后端发送的 Tauri 事件能够被前端的监听器处理
      // Tauri 事件是异步的（fire-and-forget 模式），emit 后事件需要：
      // 1. 通过 IPC 通道传递
      // 2. 在 JavaScript 事件循环中排队
      // 3. 等待事件循环处理
      // 因此需要足够的延迟时间，100ms 是一个安全的值
      await new Promise(resolve => setTimeout(resolve, 100))

      if (fullContent.trim().length > 0) {
        return fullContent
      }
      if (streamErrors.length > 0) {
        const error = streamErrors[streamErrors.length - 1]
        console.error('[AI Execute] failed', { provider, sessionId, error })
        throw new Error(error)
      }
      return fullContent
    } finally {
      this.cleanup()
    }
  }

  async abort(): Promise<void> {
    if (!this.activeSessionId || !this.activeAgentType) return
    const sessionId = this.activeSessionId
    const isCli = this.activeAgentType === 'cli'
    try {
      await invoke(isCli ? 'abort_cli_execution' : 'abort_sdk_execution', { sessionId })
    } catch (error) {
      console.warn('[TaskSplitOrchestrator] abort failed:', error)
    } finally {
      this.cleanup()
    }
  }

  private cleanup() {
    if (this.activeUnlisten) {
      this.activeUnlisten()
      this.activeUnlisten = null
    }
    this.activeSessionId = null
    this.activeAgentType = null
  }

  private getAllowedTools(provider: string): string[] {
    if (provider === 'codex') {
      return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
    }
    return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch']
  }

  private getEventName(agentType: string, provider: string): string {
    const sessionId = this.activeSessionId || ''
    if (agentType === 'cli' && provider === 'claude') return `claude-stream-${sessionId}`
    if (agentType === 'cli' && provider === 'codex') return `codex-stream-${sessionId}`
    if (agentType === 'sdk' && provider === 'codex') return `codex-sdk-stream-${sessionId}`
    return `sdk-stream-${sessionId}`
  }
}

export const taskSplitOrchestrator = new TaskSplitOrchestrator()
