import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import type {
  AgentStrategy,
  ConversationContext,
  StreamEvent,
  ExecutionRequest,
  CliStreamEvent
} from './types'

/**
 * Codex CLI 策略
 * 通过调用本地 codex 命令行工具执行对话
 */
export class CodexCliStrategy implements AgentStrategy {
  readonly name = 'Codex CLI'

  private abortController: AbortController | null = null
  private unlistenStream: UnlistenFn | null = null
  private currentSessionId: string | null = null

  supports(agent: AgentConfig): boolean {
    return agent.type === 'cli' && agent.provider === 'codex'
  }

  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const {
      sessionId,
      agent,
      messages,
      workingDirectory,
      mcpServers,
      cliOutputFormat,
      jsonSchema,
      extraCliArgs,
      executionMode,
      responseMode
    } = context

    this.currentSessionId = sessionId
    this.abortController = new AbortController()

    try {
      // 监听流式事件
      this.unlistenStream = await listen<CliStreamEvent>(
        `codex-stream-${sessionId}`,
        (event) => {
          const payload = event.payload
          const streamEvent = this.transformEvent(payload)
          if (streamEvent) {
            onEvent(streamEvent)
          }
        }
      )

      // 构建请求
      const request: ExecutionRequest = {
        sessionId,
        agentType: 'cli',
        provider: 'codex',
        cliPath: agent.cliPath || 'codex',
        modelId: agent.modelId,
        messages: messages
          .filter(m => m.role !== 'compression')
          .map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
          })),
        workingDirectory,
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        mcpServers,
        cliOutputFormat: cliOutputFormat ?? (responseMode === 'json_once' ? 'json' : 'stream-json'),
        jsonSchema,
        extraCliArgs,
        executionMode: executionMode ?? 'chat',
        responseMode: responseMode ?? 'stream_text'
      }

      console.info('[AI Execute] start', {
        provider: 'codex',
        mode: request.executionMode,
        responseMode: request.responseMode,
        outputFormat: request.cliOutputFormat,
        sessionId
      })
      await invoke('execute_agent', { request })
      console.info('[AI Execute] done', {
        provider: 'codex',
        mode: request.executionMode,
        sessionId
      })

      // 等待事件循环处理完所有待处理的事件
      // 这是为了确保后端发送的 Tauri 事件能够被前端的监听器处理
      // Tauri 事件是异步的（fire-and-forget 模式），emit 后事件需要：
      // 1. 通过 IPC 通道传递
      // 2. 在 JavaScript 事件循环中排队
      // 3. 等待事件循环处理
      // 因此需要足够的延迟时间，100ms 是一个安全的值
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      if (this.abortController?.signal.aborted) {
        onEvent({ type: 'done' })
        return
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[AI Execute] failed', {
        provider: 'codex',
        sessionId: this.currentSessionId,
        error: errorMessage
      })
      onEvent({
        type: 'error',
        error: errorMessage
      })
    } finally {
      this.cleanup()
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.abortExecution()
    this.cleanup()
  }

  private cleanup(): void {
    if (this.unlistenStream) {
      this.unlistenStream()
      this.unlistenStream = null
    }
    this.abortController = null
    this.currentSessionId = null
  }

  private abortExecution(): void {
    if (this.currentSessionId) {
      // 通知后端停止执行
      invoke('abort_cli_execution', { sessionId: this.currentSessionId }).catch((error) => {
        console.warn('[AI Execute] abort failed', error)
      })
    }
  }

  private transformEvent(event: CliStreamEvent): StreamEvent | null {
    const baseEvent = {
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      model: event.model
    }

    switch (event.type) {
      case 'content':
        return {
          type: 'content',
          content: event.content,
          ...baseEvent
        }
      case 'tool_use':
        return {
          type: 'tool_use',
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          toolInput: event.toolInput ? JSON.parse(event.toolInput) : undefined,
          ...baseEvent
        }
      case 'tool_result':
        return {
          type: 'tool_result',
          toolCallId: event.toolCallId,
          toolResult: event.toolResult,
          ...baseEvent
        }
      case 'error':
        return {
          type: 'error',
          error: event.error,
          ...baseEvent
        }
      case 'done':
        return { type: 'done', ...baseEvent }
      default:
        return null
    }
  }
}
