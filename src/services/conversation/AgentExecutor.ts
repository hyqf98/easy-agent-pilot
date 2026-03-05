import type { AgentConfig } from '@/stores/agent'
import type { AgentStrategy, ConversationContext, StreamEvent } from './strategies/types'
import { ClaudeCliStrategy } from './strategies/ClaudeCliStrategy'
import { CodexCliStrategy } from './strategies/CodexCliStrategy'
import { ClaudeSdkStrategy } from './strategies/ClaudeSdkStrategy'

/**
 * 智能体执行器
 * 负责管理策略注册和执行
 */
export class AgentExecutor {
  private strategies: AgentStrategy[] = []
  private currentStrategy: AgentStrategy | null = null

  constructor() {
    // 注册默认策略
    this.registerStrategy(new ClaudeCliStrategy())
    this.registerStrategy(new CodexCliStrategy())
    this.registerStrategy(new ClaudeSdkStrategy())
  }

  /**
   * 注册策略
   */
  registerStrategy(strategy: AgentStrategy): void {
    this.strategies.push(strategy)
  }

  /**
   * 获取支持的策略
   */
  getSupportedStrategy(agent: AgentConfig): AgentStrategy | null {
    return this.strategies.find(strategy => strategy.supports(agent)) || null
  }

  /**
   * 检查是否支持该智能体
   */
  isSupported(agent: AgentConfig): boolean {
    return this.strategies.some(strategy => strategy.supports(agent))
  }

  /**
   * 执行对话
   */
  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { agent } = context

    // 查找支持的策略
    const strategy = this.getSupportedStrategy(agent)
    if (!strategy) {
      onEvent({
        type: 'error',
        error: `不支持的智能体类型: ${agent.type} (${agent.provider || 'unknown'})`
      })
      return
    }

    this.currentStrategy = strategy

    try {
      await strategy.execute(context, onEvent)
    } finally {
      this.currentStrategy = null
    }
  }

  /**
   * 中断当前执行
   */
  abort(): void {
    if (this.currentStrategy) {
      this.currentStrategy.abort()
      this.currentStrategy = null
    }
  }

  /**
   * 获取所有已注册的策略名称
   */
  getRegisteredStrategies(): string[] {
    return this.strategies.map(s => s.name)
  }
}

// 创建全局单例
export const agentExecutor = new AgentExecutor()
