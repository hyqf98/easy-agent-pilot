import type { AgentConfig } from '@/stores/agent'
import type {
  ConversationContext,
  StreamEvent,
  ExecutionRequest
} from './types'
import { BaseAgentStrategy } from './BaseAgentStrategy'

/**
 * Claude SDK 策略
 * 通过 Claude API 执行对话
 */
export class ClaudeSdkStrategy extends BaseAgentStrategy {
  readonly name = 'Claude SDK'

  supports(agent: AgentConfig): boolean {
    return agent.type === 'sdk' && (agent.provider === 'claude' || !agent.provider)
  }

  protected validateContext(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): boolean {
    if (!context.agent.apiKey) {
      onEvent({
        type: 'error',
        error: 'API Key 未配置，请在智能体设置中配置 API Key'
      })
      return false
    }

    if (!context.agent.modelId) {
      onEvent({
        type: 'error',
        error: '模型 ID 未配置，请在智能体设置中选择模型'
      })
      return false
    }

    return true
  }

  protected getEventName(sessionId: string): string {
    return `sdk-stream-${sessionId}`
  }

  protected getAbortCommand(): 'abort_sdk_execution' {
    return 'abort_sdk_execution'
  }

  protected buildRequest(context: ConversationContext): ExecutionRequest {
    const {
      sessionId,
      agent,
      messages,
      tools,
      mcpServers,
      executionMode,
      responseMode
    } = context

    return {
      sessionId,
      agentType: 'sdk',
      provider: 'claude',
      apiKey: agent.apiKey,
      baseUrl: agent.baseUrl,
      modelId: agent.modelId,
      messages: this.toMessageInputs(messages),
      maxTokens: 4096,
      tools,
      mcpServers,
      executionMode: executionMode ?? 'chat',
      responseMode: responseMode ?? 'stream_text'
    }
  }
}
