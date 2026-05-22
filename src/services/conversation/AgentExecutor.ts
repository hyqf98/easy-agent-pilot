import type { AgentConfig } from '@/stores/agent'
import type { AgentStrategy, ConversationContext, StreamEvent } from './strategies/types'
import { AcpStrategy } from './strategies/AcpStrategy'

export class AgentExecutor {
  private strategies: AgentStrategy[] = []
  private activeStrategies: Map<string, AgentStrategy> = new Map()

  constructor() {
    this.registerStrategy(new AcpStrategy())
  }

  registerStrategy(strategy: AgentStrategy): void {
    this.strategies.push(strategy)
  }

  getSupportedStrategy(agent: AgentConfig): AgentStrategy | null {
    return this.strategies.find(strategy => strategy.supports(agent)) || null
  }

  isSupported(agent: AgentConfig): boolean {
    return this.strategies.some(strategy => strategy.supports(agent))
  }

  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { agent, sessionId } = context

    const strategy = this.getSupportedStrategy(agent)
    if (!strategy) {
      onEvent({
        type: 'error',
        error: `不支持的智能体类型: ${agent.type} (${agent.provider || 'unknown'})`
      })
      return
    }

    this.activeStrategies.set(sessionId, strategy)

    try {
      await strategy.execute(context, onEvent)
    } finally {
      this.activeStrategies.delete(sessionId)
    }
  }

  abort(sessionId: string): void {
    const strategy = this.activeStrategies.get(sessionId)
    if (strategy) {
      strategy.abort(sessionId)
      this.activeStrategies.delete(sessionId)
    }
  }

  getRegisteredStrategies(): string[] {
    return this.strategies.map(s => s.name)
  }
}

export const agentExecutor = new AgentExecutor()
