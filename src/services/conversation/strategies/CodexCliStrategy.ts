import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import type {
  AgentStrategy,
  ConversationContext,
  StreamEvent,
  CliExecutionRequest,
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
    const { sessionId, agent, messages, workingDirectory } = context

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
      const request: CliExecutionRequest = {
        sessionId,
        cliPath: agent.cliPath || 'codex',
        modelId: agent.modelId,
        messages: messages
          .filter(m => m.role !== 'compression')
          .map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
          })),
        workingDirectory,
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
      }

      // 调用后端命令
      await invoke('execute_codex_cli', { request })

    } catch (error) {
      if (this.abortController?.signal.aborted) {
        onEvent({ type: 'done' })
        return
      }
      onEvent({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      this.cleanup()
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.cleanup()
  }

  private cleanup(): void {
    if (this.unlistenStream) {
      this.unlistenStream()
      this.unlistenStream = null
    }
    if (this.currentSessionId) {
      // 通知后端停止执行
      invoke('abort_cli_execution', { sessionId: this.currentSessionId }).catch(() => {
        // 忽略错误
      })
      this.currentSessionId = null
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
