import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import type {
  AgentStrategy,
  ConversationContext,
  StreamEvent,
  SdkExecutionRequest,
  SdkStreamEvent
} from './types'

/**
 * Claude SDK 策略
 * 通过 Claude API 执行对话
 */
export class ClaudeSdkStrategy implements AgentStrategy {
  readonly name = 'Claude SDK'

  private abortController: AbortController | null = null
  private unlistenStream: UnlistenFn | null = null
  private currentSessionId: string | null = null

  supports(agent: AgentConfig): boolean {
    return agent.type === 'sdk'
  }

  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { sessionId, agent, messages, tools } = context

    // 验证必要配置
    if (!agent.apiKey) {
      onEvent({
        type: 'error',
        error: 'API Key 未配置，请在智能体设置中配置 API Key'
      })
      return
    }

    if (!agent.modelId) {
      onEvent({
        type: 'error',
        error: '模型 ID 未配置，请在智能体设置中选择模型'
      })
      return
    }

    this.currentSessionId = sessionId
    this.abortController = new AbortController()

    try {
      // 监听流式事件
      this.unlistenStream = await listen<SdkStreamEvent>(
        `sdk-stream-${sessionId}`,
        (event) => {
          const payload = event.payload
          const streamEvent = this.transformEvent(payload)
          if (streamEvent) {
            onEvent(streamEvent)
          }
        }
      )

      // 构建请求
      const request: SdkExecutionRequest = {
        sessionId,
        apiKey: agent.apiKey,
        baseUrl: agent.baseUrl,
        modelId: agent.modelId,
        messages: messages
          .filter(m => m.role !== 'compression') // 过滤掉压缩摘要消息
          .map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
          })),
        maxTokens: 4096,
        tools
      }

      // 调用后端命令
      await invoke('execute_claude_sdk', { request })

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
      invoke('abort_sdk_execution', { sessionId: this.currentSessionId }).catch(() => {
        // 忽略错误
      })
      this.currentSessionId = null
    }
  }

  private transformEvent(event: SdkStreamEvent): StreamEvent | null {
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
      case 'thinking':
        return {
          type: 'thinking',
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
