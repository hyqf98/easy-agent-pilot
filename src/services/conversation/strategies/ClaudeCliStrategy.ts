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

// 简单的日志函数
const log = (level: 'info' | 'error' | 'debug', ...args: unknown[]) => {
  const prefix = `[ClaudeCliStrategy][${level.toUpperCase()}]`
  if (level === 'error') {
    console.error(prefix, ...args)
  } else if (level === 'debug') {
    console.debug(prefix, ...args)
  } else {
    console.log(prefix, ...args)
  }
}

/**
 * Claude CLI 策略
 * 通过调用本地 claude 命令行工具执行对话
 */
export class ClaudeCliStrategy implements AgentStrategy {
  readonly name = 'Claude CLI'

  private abortController: AbortController | null = null
  private unlistenStream: UnlistenFn | null = null
  private currentSessionId: string | null = null

  supports(agent: AgentConfig): boolean {
    const result = agent.type === 'cli' && agent.provider === 'claude'
    log('debug', `supports check: type=${agent.type}, provider=${agent.provider}, result=${result}`)
    return result
  }

  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { sessionId, agent, messages, workingDirectory } = context

    log('info', `开始执行, sessionId: ${sessionId}`)
    log('info', `智能体配置:`, { id: agent.id, name: agent.name, cliPath: agent.cliPath, modelId: agent.modelId })
    log('info', `消息数量: ${messages.length}`)
    log('debug', `工作目录: ${workingDirectory}`)

    this.currentSessionId = sessionId
    this.abortController = new AbortController()

    try {
      // 监听流式事件
      const eventName = `claude-stream-${sessionId}`
      log('info', `注册事件监听: ${eventName}`)

      this.unlistenStream = await listen<CliStreamEvent>(
        eventName,
        (event) => {
          const payload = event.payload
          log('debug', `收到事件:`, payload)
          const streamEvent = this.transformEvent(payload)
          if (streamEvent) {
            log('debug', `转换后事件:`, streamEvent)
            onEvent(streamEvent)
          } else {
            log('debug', `事件转换返回 null`)
          }
        }
      )

      // 构建请求
      const request: CliExecutionRequest = {
        sessionId,
        cliPath: agent.cliPath || 'claude',
        // 只有当 modelId 非空且不是 "default" 时才传递
        modelId: agent.modelId && agent.modelId.trim() && agent.modelId !== 'default'
          ? agent.modelId
          : undefined,
        messages: messages
          .filter(m => m.role !== 'compression')
          .map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
          })),
        workingDirectory,
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch']
      }

      log('info', `调用后端命令, cliPath: ${request.cliPath}`)

      // 调用后端命令
      await invoke('execute_claude_cli', { request })

      log('info', `后端命令执行完成`)

    } catch (error) {
      log('error', `执行出错:`, error)
      if (this.abortController?.signal.aborted) {
        log('info', `执行被中断`)
        onEvent({ type: 'done' })
        return
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      log('error', `发送错误事件: ${errorMessage}`)
      onEvent({
        type: 'error',
        error: errorMessage
      })
    } finally {
      this.cleanup()
    }
  }

  abort(): void {
    log('info', `中断执行`)
    if (this.abortController) {
      this.abortController.abort()
    }
    this.cleanup()
  }

  private cleanup(): void {
    log('debug', `清理资源`)
    if (this.unlistenStream) {
      this.unlistenStream()
      this.unlistenStream = null
    }
    if (this.currentSessionId) {
      // 通知后端停止执行
      invoke('abort_cli_execution', { sessionId: this.currentSessionId }).catch((e) => {
        log('debug', `中断后端执行失败:`, e)
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
      case 'thinking':
      case 'thinking_start':
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
      case 'tool_input_delta':
        // 工具输入增量，暂时忽略，等待完整的工具输入
        return null
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
        log('debug', `未知事件类型: ${event.type}`)
        return null
    }
  }
}
