import type { AgentConfig } from '@/stores/agent'
import type { Message } from '@/stores/message'

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 权限配置
 */
export interface PermissionConfig {
  allowFileRead: boolean
  allowFileWrite: boolean
  allowNetwork: boolean
  allowedPaths?: string[]
}

/**
 * 对话上下文
 */
export interface ConversationContext {
  /** 会话 ID */
  sessionId: string
  /** 智能体配置 */
  agent: AgentConfig
  /** 消息历史 */
  messages: Message[]
  /** 工具定义 */
  tools?: ToolDefinition[]
  /** 权限配置 */
  permissions?: PermissionConfig
  /** 工作目录 */
  workingDirectory?: string
}

/**
 * 流式事件类型
 */
export type StreamEventType = 'content' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'thinking'

/**
 * 流式事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: StreamEventType
  /** 文本内容 */
  content?: string
  /** 工具名称 */
  toolName?: string
  /** 工具输入参数 */
  toolInput?: Record<string, unknown>
  /** 工具调用 ID */
  toolCallId?: string
  /** 工具结果 */
  toolResult?: unknown
  /** 错误信息 */
  error?: string
  /** 输入 token 数量 */
  inputTokens?: number
  /** 输出 token 数量 */
  outputTokens?: number
  /** 模型名称 */
  model?: string
}

/**
 * 智能体策略接口
 */
export interface AgentStrategy {
  /** 策略名称 */
  readonly name: string

  /**
   * 检查是否支持该智能体
   * @param agent 智能体配置
   */
  supports(agent: AgentConfig): boolean

  /**
   * 执行对话
   * @param context 对话上下文
   * @param onEvent 事件回调
   */
  execute(context: ConversationContext, onEvent: (event: StreamEvent) => void): Promise<void>

  /**
   * 中断执行
   */
  abort(): void
}

/**
 * CLI 执行请求
 */
export interface CliExecutionRequest {
  /** 会话 ID */
  sessionId: string
  /** CLI 路径 */
  cliPath: string
  /** 模型 ID */
  modelId?: string
  /** 消息历史 */
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  /** 工作目录 */
  workingDirectory?: string
  /** 允许的工具列表 */
  allowedTools?: string[]
}

/**
 * SDK 执行请求
 */
export interface SdkExecutionRequest {
  /** 会话 ID */
  sessionId: string
  /** API 密钥 */
  apiKey: string
  /** API 端点 */
  baseUrl?: string
  /** 模型 ID */
  modelId: string
  /** 消息历史 */
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  /** 系统提示 */
  systemPrompt?: string
  /** 最大令牌数 */
  maxTokens?: number
  /** 工具定义 */
  tools?: ToolDefinition[]
}

/**
 * CLI 流式事件（后端返回）
 */
export interface CliStreamEvent {
  /** 事件类型 */
  type: 'content' | 'tool_use' | 'tool_input_delta' | 'tool_result' | 'error' | 'done' | 'thinking' | 'thinking_start'
  /** 会话 ID */
  sessionId: string
  /** 内容 */
  content?: string
  /** 工具名称 */
  toolName?: string
  /** 工具调用 ID */
  toolCallId?: string
  /** 工具输入 */
  toolInput?: string
  /** 工具结果 */
  toolResult?: string
  /** 错误信息 */
  error?: string
  /** 输入 token 数量 */
  inputTokens?: number
  /** 输出 token 数量 */
  outputTokens?: number
  /** 模型名称 */
  model?: string
}

/**
 * SDK 流式事件（后端返回）
 */
export interface SdkStreamEvent {
  /** 事件类型 */
  type: 'content' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'thinking'
  /** 会话 ID */
  sessionId: string
  /** 内容 */
  content?: string
  /** 工具名称 */
  toolName?: string
  /** 工具调用 ID */
  toolCallId?: string
  /** 工具输入 */
  toolInput?: string
  /** 工具结果 */
  toolResult?: string
  /** 错误信息 */
  error?: string
  /** 输入 token 数量 */
  inputTokens?: number
  /** 输出 token 数量 */
  outputTokens?: number
  /** 模型名称 */
  model?: string
}
