import { useMessageStore, type Message, type ToolCall } from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useProjectStore } from '@/stores/project'
import { useAgentStore, type AgentConfig } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useSkillConfigStore } from '@/stores/skillConfig'
import { useBrainstormStore } from '@/stores/brainstorm'
import { useTokenStore } from '@/stores/token'
import { agentExecutor } from './AgentExecutor'
import type { ConversationContext, StreamEvent, McpServerConfig } from './strategies/types'
import { buildBrainstormSystemPrompt, extractBrainstormPayload, executeTodoOpsInternalTool } from '@/services/brainstorm'
import { compressionService } from '@/services/compression/CompressionService'

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
    const agentConfigStore = useAgentConfigStore()
    const skillConfigStore = useSkillConfigStore()
    const brainstormStore = useBrainstormStore()

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

      // 如果会话名称是默认名称（未命名会话），则用第一条消息的前几个字更新
      const session = sessionStore.sessions.find(s => s.id === sessionId)
      if (session && (session.name === '未命名会话' || session.name.startsWith('新会话'))) {
        // 提取前20个字符作为会话名称，去掉换行符
        const newTitle = content.replace(/\n/g, ' ').slice(0, 20).trim()
        const finalTitle = newTitle.length < content.length ? newTitle + '...' : newTitle
        if (finalTitle) {
          await sessionStore.updateSession(sessionId, { name: finalTitle })
        }
      }

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

      await brainstormStore.loadSession(sessionId)

      // 获取启用的 MCP 配置
      const enabledMcpIds = sessionExecutionStore.getEnabledMcpIds(sessionId)
      let mcpServers: McpServerConfig[] | undefined

      if (enabledMcpIds.length > 0) {
        if (agent.type === 'cli') {
          // CLI 类型：从 skillConfigStore 获取 MCP 配置
          const allMcpConfigs = skillConfigStore.mcpConfigs
          mcpServers = allMcpConfigs
            .filter(config => enabledMcpIds.includes(config.id))
            .map(config => ({
              id: config.id,
              name: config.name,
              transportType: config.transportType,
              command: config.command,
              args: Array.isArray(config.args) ? config.args.join(' ') : config.args,
              env: typeof config.env === 'object' ? JSON.stringify(config.env) : config.env,
              url: config.url,
              headers: typeof config.headers === 'object' ? JSON.stringify(config.headers) : config.headers
            }))
        } else {
          // SDK 类型：从 agentConfigStore 获取 MCP 配置
          const allMcpConfigs = agentConfigStore.getMcpConfigs(agentId)
          mcpServers = allMcpConfigs
            .filter(config => enabledMcpIds.includes(config.id))
            .map(config => ({
              id: config.id,
              name: config.name,
              transportType: config.transportType,
              command: config.command,
              args: typeof config.args === 'string' ? config.args : undefined,
              env: typeof config.env === 'string' ? config.env : undefined,
              url: config.url,
              headers: typeof config.headers === 'string' ? config.headers : undefined
            }))
        }
      }

      // 构建对话上下文
      const brainstormMode = brainstormStore.getSessionMode(sessionId)
      let messages = messageStore.messagesBySession(sessionId)

      if (brainstormMode === 'brainstorm') {
        const systemPrompt = buildBrainstormSystemPrompt({
          context: brainstormStore.getSessionContext(sessionId),
          todos: brainstormStore.getSessionTodos(sessionId)
        })
        const systemMessage: Message = {
          id: `brainstorm-system-${sessionId}`,
          sessionId,
          role: 'system',
          content: systemPrompt,
          status: 'completed',
          createdAt: new Date().toISOString()
        }
        messages = [systemMessage, ...messages]
      }

      const context: ConversationContext = {
        sessionId,
        agent,
        messages,
        workingDirectory,
        mcpServers,
        executionMode: 'chat',
        responseMode: 'stream_text'
      }

      // 执行对话
      await this.executeConversation(context, aiMessage, sessionId)
      if (brainstormMode === 'brainstorm') {
        await this.processBrainstormAssistantOutput(sessionId, aiMessage.id)
      }

    } catch (error) {
      sessionExecutionStore.endSending(sessionId)
      throw error
    }
  }

  private async processBrainstormAssistantOutput(
    sessionId: string,
    assistantMessageId: string
  ): Promise<void> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const brainstormStore = useBrainstormStore()

    const assistantMessage = messageStore.messages.find(
      message => message.id === assistantMessageId && message.role === 'assistant'
    )

    if (!assistantMessage) {
      return
    }

    const parsed = extractBrainstormPayload(assistantMessage.content)
    const updates: Partial<Message> = {}

    if (parsed.displayContent !== assistantMessage.content) {
      updates.content = parsed.displayContent
    }

    if (!parsed.payload) {
      if (Object.keys(updates).length > 0) {
        await messageStore.updateMessage(assistantMessage.id, updates)
      }
      return
    }

    if (parsed.payload.contextPatch) {
      await brainstormStore.patchSessionContext(sessionId, parsed.payload.contextPatch)
    }

    if (parsed.payload.formRequest) {
      brainstormStore.setPendingForm(sessionId, parsed.payload.formRequest)
      if (!((updates.content ?? assistantMessage.content).trim()) && parsed.payload.formRequest.question) {
        updates.content = parsed.payload.formRequest.question
      }
    }

    if (parsed.payload.todoOps && parsed.payload.todoOps.length > 0) {
      const toolResult = await executeTodoOpsInternalTool({
        sessionId,
        sourceMessageId: assistantMessage.id,
        ops: parsed.payload.todoOps,
        apply: async (targetSessionId, ops, sourceMessageId) => {
          return brainstormStore.applyTodoOps(targetSessionId, ops, sourceMessageId)
        }
      })

      const mergedToolCalls = assistantMessage.toolCalls
        ? [...assistantMessage.toolCalls, toolResult.toolCall]
        : [toolResult.toolCall]

      updates.toolCalls = mergedToolCalls
    }

    if (Object.keys(updates).length > 0) {
      await messageStore.updateMessage(assistantMessage.id, updates)
      if (typeof updates.content === 'string') {
        try {
          await sessionStore.updateSession(sessionId, {
            lastMessage: updates.content.slice(0, 50)
          })
        } catch (error) {
          console.warn('[ConversationService] Failed to sync brainstorm preview:', error)
        }
      }
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
    let accumulatedThinking = ''
    const toolCalls: ToolCall[] = []
    let hasError = false

    try {
      await agentExecutor.execute(context, (event: StreamEvent) => {
        this.handleStreamEvent(event, {
          aiMessage,
          sessionId,
          toolCalls,
          onContent: (content) => {
            accumulatedContent += content
            // 更新消息内容
            messageStore.updateMessage(aiMessage.id, {
              content: accumulatedContent
            })
          },
          onThinking: (thinking) => {
            accumulatedThinking += thinking
            // 更新思考内容
            messageStore.updateMessage(aiMessage.id, {
              thinking: accumulatedThinking
            })
          },
          onToolUse: (toolCall) => {
            // 添加或更新工具调用
            const existingIndex = toolCalls.findIndex(tc => tc.id === toolCall.id)
            if (existingIndex >= 0) {
              toolCalls[existingIndex] = toolCall
            } else {
              toolCalls.push(toolCall)
            }
            // 更新消息的工具调用
            messageStore.updateMessage(aiMessage.id, {
              toolCalls: [...toolCalls]
            })
          },
          onToolResult: (toolCallId, result, isError) => {
            // 更新工具调用的结果
            const tc = toolCalls.find(t => t.id === toolCallId)
            if (tc) {
              tc.result = result
              tc.status = isError ? 'error' : 'success'
              if (isError) {
                tc.errorMessage = result
              }
              // 更新消息的工具调用
              messageStore.updateMessage(aiMessage.id, {
                toolCalls: [...toolCalls]
              })
            }
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

            // 自动压缩检查
            compressionService.checkAndAutoCompress(sessionId, context.agent.id)
          }
        })
      })

      // 兜底：部分后端/CLI 场景可能不会显式发出 done 事件，避免状态长期卡在“生成中”
      if (sessionExecutionStore.getIsSending(sessionId)) {
        if (!hasError) {
          await messageStore.updateMessage(aiMessage.id, {
            status: 'completed'
          })
          sessionStore.updateLastMessage(
            sessionId,
            accumulatedContent.slice(0, 50)
          )
        }
        sessionExecutionStore.endSending(sessionId)
      }
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
      toolCalls: ToolCall[]
      onContent: (content: string) => void
      onThinking: (thinking: string) => void
      onToolUse: (toolCall: ToolCall) => void
      onToolResult: (toolCallId: string, result: string, isError: boolean) => void
      onError: (error: string) => void
      onDone: () => void
    }
  ): void {
    const { onContent, onThinking, onToolUse, onToolResult, onError, onDone } = handlers
    const tokenStore = useTokenStore()

    // 处理 token 事件 - 优先使用 CLI 返回的真实 token 数据
    if (event.inputTokens !== undefined || event.outputTokens !== undefined) {
      tokenStore.updateRealtimeTokens(handlers.sessionId, event.inputTokens ?? 0, event.outputTokens ?? 0)
    }

    switch (event.type) {
      case 'content':
        if (event.content) {
          onContent(event.content)
        }
        break

      case 'thinking':
        // 处理思考内容
        if (event.content) {
          onThinking(event.content)
        }
        break

      case 'tool_use':
        // 处理工具调用
        if (event.toolName && event.toolCallId) {
          const toolCall: ToolCall = {
            id: event.toolCallId,
            name: event.toolName,
            arguments: event.toolInput || {},
            status: 'running'
          }
          onToolUse(toolCall)
        }
        break

      case 'tool_result':
        // 处理工具结果
        if (event.toolCallId) {
          const result = typeof event.toolResult === 'string'
            ? event.toolResult
            : JSON.stringify(event.toolResult, null, 2)
          onToolResult(event.toolCallId, result, false)
        }
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
