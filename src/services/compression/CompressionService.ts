import { useMessageStore, type Message, type ToolCallSummary, type CompressionMetadata } from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useAgentStore } from '@/stores/agent'
import { useTokenStore, type CompressionStrategy } from '@/stores/token'
import type { AgentConfig } from '@/stores/agent'

/**
 * 压缩选项
 */
export interface CompressionOptions {
  strategy: CompressionStrategy
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  success: boolean
  summary?: string
  originalMessageCount: number
  originalTokenCount: number
  error?: string
}

/**
 * 会话压缩服务
 * 负责压缩会话消息，生成摘要，释放 token 空间
 */
export class CompressionService {
  private static instance: CompressionService | null = null

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): CompressionService {
    if (!CompressionService.instance) {
      CompressionService.instance = new CompressionService()
    }
    return CompressionService.instance
  }

  /**
   * 执行会话压缩
   */
  async compressSession(
    sessionId: string,
    agentId: string,
    options: CompressionOptions
  ): Promise<CompressionResult> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const sessionExecutionStore = useSessionExecutionStore()
    const tokenStore = useTokenStore()

    // 获取当前会话的所有消息
    const messages = messageStore.messagesBySession(sessionId)
    const messageCount = messages.length

    if (messageCount === 0) {
      return {
        success: false,
        error: '没有消息可以压缩',
        originalMessageCount: 0,
        originalTokenCount: 0
      }
    }

    // 计算当前 token 使用量
    const tokenUsage = tokenStore.getTokenUsage(sessionId)
    const originalTokenCount = tokenUsage.used

    // 检查是否正在发送消息
    if (sessionExecutionStore.getIsSending(sessionId)) {
      return {
        success: false,
        error: '正在发送消息，请稍后再试',
        originalMessageCount: messageCount,
        originalTokenCount
      }
    }

    try {
      // 开始压缩状态
      sessionExecutionStore.startSending(sessionId)

      // 提取工具调用摘要
      const toolCallsSummary = this.extractToolCallsSummary(messages)

      let summaryContent = ''

      if (options.strategy === 'summary') {
        // 使用 AI 生成摘要
        summaryContent = await this.generateSummary(sessionId, agentId, messages, toolCallsSummary)
      } else {
        // 简单压缩：只保留基本信息
        summaryContent = this.generateSimpleSummary(messages, toolCallsSummary)
      }

      // 清空当前会话消息
      await messageStore.clearSessionMessages(sessionId)

      // 创建压缩摘要消息
      const compressionMetadata: CompressionMetadata = {
        compressedAt: new Date().toISOString(),
        originalMessageCount: messageCount,
        originalTokenCount,
        strategy: options.strategy,
        toolCallsSummary: toolCallsSummary.length > 0 ? toolCallsSummary : undefined
      }

      // 添加压缩消息作为第一条消息
      await messageStore.addMessage({
        sessionId,
        role: 'compression',
        content: summaryContent,
        status: 'completed',
        compressionMetadata
      })

      // 更新会话最后消息
      sessionStore.updateLastMessage(sessionId, summaryContent.slice(0, 50))

      // 清除 token 缓存
      tokenStore.clearSessionTokenCache(sessionId)

      return {
        success: true,
        summary: summaryContent,
        originalMessageCount: messageCount,
        originalTokenCount
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: errorMessage,
        originalMessageCount: messageCount,
        originalTokenCount
      }
    } finally {
      sessionExecutionStore.endSending(sessionId)
    }
  }

  /**
   * 提取工具调用摘要
   */
  private extractToolCallsSummary(messages: Message[]): ToolCallSummary[] {
    const toolCallMap = new Map<string, { count: number; successCount: number; errorCount: number }>()

    for (const message of messages) {
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          const existing = toolCallMap.get(toolCall.name) || { count: 0, successCount: 0, errorCount: 0 }
          existing.count++
          if (toolCall.status === 'success') {
            existing.successCount++
          } else if (toolCall.status === 'error') {
            existing.errorCount++
          }
          toolCallMap.set(toolCall.name, existing)
        }
      }
    }

    return Array.from(toolCallMap.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      status: data.errorCount === 0
        ? 'success'
        : data.successCount === 0
          ? 'error'
          : 'mixed'
    }))
  }

  /**
   * 生成简单摘要
   */
  private generateSimpleSummary(messages: Message[], toolCallsSummary: ToolCallSummary[]): string {
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    let summary = `## 会话摘要\n\n`
    summary += `- **用户消息**: ${userMessages.length} 条\n`
    summary += `- **AI 回复**: ${assistantMessages.length} 条\n`

    if (toolCallsSummary.length > 0) {
      summary += `\n### 工具调用记录\n`
      for (const tool of toolCallsSummary) {
        const statusEmoji = tool.status === 'success' ? '✅' : tool.status === 'error' ? '❌' : '⚠️'
        summary += `- ${statusEmoji} **${tool.name}**: ${tool.count} 次\n`
      }
    }

    summary += `\n> 此会话已压缩以释放 token 空间。\n`

    return summary
  }

  /**
   * 使用 AI 生成对话摘要
   */
  private async generateSummary(
    sessionId: string,
    agentId: string,
    messages: Message[],
    toolCallsSummary: ToolCallSummary[]
  ): Promise<string> {
    const agentStore = useAgentStore()
    const sessionStore = useSessionStore()
    const messageStore = useMessageStore()
    const sessionExecutionStore = useSessionExecutionStore()

    // 获取智能体配置
    const agent = agentStore.agents.find(a => a.id === agentId)
    if (!agent) {
      throw new Error('智能体不存在')
    }

    // 构建摘要提示词
    const prompt = this.buildSummaryPrompt(messages, toolCallsSummary)

    // 获取工作目录
    const session = sessionStore.sessions.find(s => s.id === sessionId)
    let workingDirectory: string | undefined
    if (session?.projectId) {
      const projectStore = await import('@/stores/project').then(m => m.useProjectStore())
      const project = projectStore.projects.find(p => p.id === session.projectId)
      workingDirectory = project?.path
    }

    // 保存当前流式消息
    let summaryContent = ''

    // 创建一个临时的摘要请求消息
    const tempUserMessage = await messageStore.addMessage({
      sessionId,
      role: 'user',
      content: prompt,
      status: 'completed'
    })

    const aiMessage = await messageStore.addMessage({
      sessionId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })

    sessionExecutionStore.setCurrentStreamingMessageId(sessionId, aiMessage.id)

    try {
      // 使用对话服务生成摘要
      await this.executeSummaryGeneration(agent, prompt, sessionId, workingDirectory, (content) => {
        summaryContent += content
        messageStore.updateMessage(aiMessage.id, {
          content: summaryContent
        })
      })

      // 更新消息状态
      await messageStore.updateMessage(aiMessage.id, {
        status: 'completed'
      })

      // 删除临时消息
      await messageStore.deleteMessage(tempUserMessage.id)
      await messageStore.deleteMessage(aiMessage.id)

      return summaryContent
    } catch (error) {
      // 清理临时消息
      try {
        await messageStore.deleteMessage(tempUserMessage.id)
        await messageStore.deleteMessage(aiMessage.id)
      } catch {
        // 忽略删除错误
      }
      throw error
    }
  }

  /**
   * 执行摘要生成
   */
  private async executeSummaryGeneration(
    agent: AgentConfig,
    _prompt: string,
    sessionId: string,
    workingDirectory: string | undefined,
    onContent: (content: string) => void
  ): Promise<void> {
    const { agentExecutor } = await import('@/services/conversation/AgentExecutor')
    const { useMessageStore } = await import('@/stores/message')
    const messageStore = useMessageStore()

    // 获取当前消息（包含我们的临时提示）
    const messages = messageStore.messagesBySession(sessionId)

    const context = {
      sessionId,
      agent,
      messages,
      workingDirectory
    }

    let accumulatedContent = ''

    return new Promise((resolve, reject) => {
      agentExecutor.execute(context, (event) => {
        switch (event.type) {
          case 'content':
            if (event.content) {
              accumulatedContent += event.content
              onContent(accumulatedContent)
            }
            break
          case 'error':
            reject(new Error(event.error || '生成摘要失败'))
            break
          case 'done':
            resolve()
            break
        }
      }).catch(reject)
    })
  }

  /**
   * 构建摘要提示词
   */
  private buildSummaryPrompt(messages: Message[], toolCallsSummary: ToolCallSummary[]): string {
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    let prompt = `请为以下对话生成一个简洁的摘要，保留关键信息和上下文。

## 对话统计
- 用户消息: ${userMessages.length} 条
- AI 回复: ${assistantMessages.length} 条

`

    if (toolCallsSummary.length > 0) {
      prompt += `## 工具调用记录\n`
      for (const tool of toolCallsSummary) {
        const statusEmoji = tool.status === 'success' ? '✅' : tool.status === 'error' ? '❌' : '⚠️'
        prompt += `- ${statusEmoji} ${tool.name}: ${tool.count} 次\n`
      }
      prompt += '\n'
    }

    prompt += `## 最近对话内容

`

    // 只包含最近的几条消息
    const recentMessages = messages.slice(-10)
    for (const msg of recentMessages) {
      const role = msg.role === 'user' ? '用户' : 'AI'
      const content = msg.content.slice(0, 500) + (msg.content.length > 500 ? '...' : '')
      prompt += `**${role}**: ${content}\n\n`
    }

    prompt += `## 要求

请生成一个结构化的摘要，包含：
1. **主要话题**: 简要描述对话的主要内容和目标
2. **关键信息**: 列出重要的上下文信息、决策和结论
3. **未完成事项**: 如果有未完成的任务或待解决的问题，请列出
4. **后续建议**: 基于对话内容，给出后续可能的行动建议

请用中文回答，保持简洁但信息完整。`

    return prompt
  }
}

// 导出单例
export const compressionService = CompressionService.getInstance()
