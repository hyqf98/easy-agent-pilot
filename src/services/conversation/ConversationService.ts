import { useMessageStore, type Message } from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useProjectStore } from '@/stores/project'
import { useAgentStore, type AgentConfig } from '@/stores/agent'
import { agentExecutor } from './AgentExecutor'
import type { ConversationContext, StreamEvent } from './strategies/types'

/**
 * 对话服务
 * 封装消息发送逻辑，处理流式事件更新
 */
export class ConversationService {
  private static instance: ConversationService | null = null

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ConversationService {
    if (!ConversationService.instance) {
      ConversationService.instance = new ConversationService()
    }
    return ConversationService.instance
  }

  /**
   * 发送消息并执行对话
   * @param projectId 可选的项目 ID,用于指定工作目录
   */
  async sendMessage(
    sessionId: string,
    content: string,
    agentId: string,
    projectId?: string
  ): Promise<void> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const sessionExecutionStore = useSessionExecutionStore()
    const projectStore = useProjectStore()
    const agentStore = useAgentStore()

    // 获取智能体配置
    const agent = agentStore.agents.find(a => a.id === agentId)
    if (!agent) {
      throw new Error('智能体不存在')
    }

    // 检查策略支持
    if (!agentExecutor.isSupported(agent)) {
      throw new Error(`不支持的智能体类型: ${agent.type}`)
    }

    // 开始发送状态
    sessionExecutionStore.startSending(sessionId)

    try {
      // 添加用户消息
      await messageStore.addMessage({
        sessionId,
        role: 'user',
        content,
        status: 'completed'
      })

      // 更新会话最后消息
      sessionStore.updateLastMessage(sessionId, content.slice(0, 50))

      // 创建流式 AI 响应消息
      const aiMessage = await messageStore.addMessage({
        sessionId,
        role: 'assistant',
        content: '',
        status: 'streaming'
      })

      // 保存当前流式消息 ID
      sessionExecutionStore.setCurrentStreamingMessageId(sessionId, aiMessage.id)

      // 获取工作目录：优先使用传入的项目 ID，否则使用会话关联的项目
      let workingDirectory: string | undefined
      if (projectId) {
        // 使用传入的项目 ID
        const project = projectStore.projects.find(p => p.id === projectId)
        workingDirectory = project?.path
      } else {
        // 使用会话关联的项目
        const session = sessionStore.sessions.find(s => s.id === sessionId)
        if (session?.projectId) {
          const project = projectStore.projects.find(p => p.id === session.projectId)
          workingDirectory = project?.path
        }
      }

      // 构建对话上下文
      const messages = messageStore.messagesBySession(sessionId)
      const context: ConversationContext = {
        sessionId,
        agent,
        messages,
        workingDirectory
      }

      // 执行对话
      await this.executeConversation(context, aiMessage, sessionId)

    } catch (error) {
      sessionExecutionStore.endSending(sessionId)
      throw error
    }
  }

  /**
   * 执行对话
   */
  private async executeConversation(
    context: ConversationContext,
    aiMessage: Message,
    sessionId: string
  ): Promise<void> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const sessionExecutionStore = useSessionExecutionStore()

    let accumulatedContent = ''
    let hasError = false

    try {
      await agentExecutor.execute(context, (event: StreamEvent) => {
        this.handleStreamEvent(event, {
          aiMessage,
          sessionId,
          onContent: (content) => {
            accumulatedContent += content
            // 更新消息内容
            messageStore.updateMessage(aiMessage.id, {
              content: accumulatedContent
            })
          },
          onError: (error) => {
            hasError = true
            messageStore.updateMessage(aiMessage.id, {
              status: 'error',
              errorMessage: error
            })
          },
          onDone: () => {
            // 更新消息状态
            if (!hasError) {
              messageStore.updateMessage(aiMessage.id, {
                status: 'completed'
              })
              // 更新会话最后消息
              sessionStore.updateLastMessage(
                sessionId,
                accumulatedContent.slice(0, 50)
              )
            }
            sessionExecutionStore.endSending(sessionId)
          }
        })
      })
    } catch (error) {
      hasError = true
      const errorMessage = error instanceof Error ? error.message : String(error)
      await messageStore.updateMessage(aiMessage.id, {
        status: 'error',
        errorMessage
      })
      sessionExecutionStore.endSending(sessionId)
    }
  }

  /**
   * 处理流式事件
   */
  private handleStreamEvent(
    event: StreamEvent,
    handlers: {
      aiMessage: Message
      sessionId: string
      onContent: (content: string) => void
      onError: (error: string) => void
      onDone: () => void
    }
  ): void {
    const { onContent, onError, onDone } = handlers

    switch (event.type) {
      case 'content':
        if (event.content) {
          onContent(event.content)
        }
        break

      case 'thinking':
        // 思考内容暂时作为普通内容处理
        if (event.content) {
          onContent(event.content)
        }
        break

      case 'tool_use':
        // TODO: 处理工具调用显示
        console.debug('Tool use:', event.toolName, event.toolInput)
        break

      case 'tool_result':
        // TODO: 处理工具结果
        console.debug('Tool result:', event.toolResult)
        break

      case 'error':
        if (event.error) {
          onError(event.error)
        }
        break

      case 'done':
        onDone()
        break
    }
  }

  /**
   * 中断当前执行
   */
  abort(): void {
    agentExecutor.abort()
  }

  /**
   * 检查智能体是否可用
   */
  isAgentAvailable(agent: AgentConfig): { available: boolean; reason?: string } {
    if (!agentExecutor.isSupported(agent)) {
      return {
        available: false,
        reason: `不支持的智能体类型: ${agent.type}`
      }
    }

    // CLI 类型检查路径
    if (agent.type === 'cli' && !agent.cliPath) {
      return {
        available: false,
        reason: 'CLI 路径未配置'
      }
    }

    // SDK 类型检查 API Key
    if (agent.type === 'sdk') {
      if (!agent.apiKey) {
        return {
          available: false,
          reason: 'API Key 未配置'
        }
      }
      if (!agent.modelId) {
        return {
          available: false,
          reason: '模型未选择'
        }
      }
    }

    return { available: true }
  }
}

// 导出单例
export const conversationService = ConversationService.getInstance()
