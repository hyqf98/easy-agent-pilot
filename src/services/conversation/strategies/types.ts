import type { AgentConfig } from '@/stores/agent'
import type { Message, MessageAttachment } from '@/stores/message'
import type { FileEditTrace } from '@/types/fileTrace'
import type { ReasoningEffortLevel } from '@/types/reasoning'

/**
 */
export interface McpServerConfig {
  id: string
  /** MCP 名称 */
  name: string
  /** 传输类型 */
  transportType: 'stdio' | 'sse' | 'http' | 'builtin'
  /** 命令 (stdio 类型) */
  command?: string
  args?: string
  env?: string
  /** URL (sse/http 类型) */
  url?: string
  headers?: string
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
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
  /** 回合 ID：本次发送的 user 消息与其触发的所有 assistant 事件共享 */
  requestId: string
  /** 智能体配置 */
  agent: AgentConfig
  /** 消息历史 */
  messages: Message[]
  /** 工具定义 */
  tools?: ToolDefinition[]
  permissions?: PermissionConfig
  /** 工作目录 */
  workingDirectory?: string
  mcpServers?: McpServerConfig[]
  /** 模型 ID 覆盖（缺省取 agent.modelId） */
  modelId?: string
  executionMode?: 'chat' | 'task_split' | 'task_execution' | 'solo_execution'
  responseMode?: 'stream_text' | 'json_once'
  cliOutputFormat?: 'text' | 'json' | 'stream-json'
  jsonSchema?: string
  extraCliArgs?: string[]
  resumeSessionId?: string
  reasoningEffort?: ReasoningEffortLevel
  /** 记忆库仓库运行时：是否向 ACP 会话注入内置 MCP 工具（查询对话历史）。 */
  internalToolsEnabled?: boolean
  /** 记忆库仓库 ID，决定内置工具查询的数据源范围（配合 internalToolsEnabled）。 */
  repoId?: string
}

/**
 * 流式事件类型
 */
export type StreamEventType =
  | 'content'
  | 'tool_use'
  | 'tool_input_delta'
  | 'tool_result'
  | 'error'
  | 'done'
  | 'thinking'
  | 'thinking_start'
  | 'file_edit'
  | 'usage'
  | 'system'
  | 'plan'
  | 'available_commands'
  | 'permission_request'
  // 上下文窗口占用（ACP UsageUpdate{used,size}），仅用于刷新进度条占用，
  // 不参与 input/output token 计费统计（与 usage 事件通道分离）。
  | 'context_window'

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
  toolInput?: Record<string, unknown>
  /** 工具调用 ID */
  toolCallId?: string
  /** 工具结果 */
  toolResult?: unknown
  error?: string
  /** 输入 token 数量 */
  inputTokens?: number
  /** 输出 token 数量 */
  outputTokens?: number
  /** provider 原始输入 token 数量 */
  rawInputTokens?: number
  /** provider 原始输出 token 数量 */
  rawOutputTokens?: number
  /** provider 返回的缓存读取输入 token 数量 */
  cacheReadInputTokens?: number
  /** provider 返回的缓存写入输入 token 数量 */
  cacheCreationInputTokens?: number
  /** 模型名称 */
  model?: string
  /** 上下文窗口已用 token（仅 context_window 事件，对应 ACP UsageUpdate.used） */
  contextWindowUsed?: number
  /** 上下文窗口总大小（仅 context_window 事件，对应 ACP UsageUpdate.size） */
  contextWindowSize?: number
  fileEdit?: FileEditTrace
  externalSessionId?: string
  /** ACP 权限询问时携带的可选项（仅 permission_request 事件使用） */
  permissionOptions?: PermissionOption[]
  /** 工具语义类别（read/edit/delete/move/search/execute/think/fetch/switch_mode/other） */
  toolKind?: string
  /** 工具访问/修改的文件位置（透传 ACP ToolCallLocation） */
  toolLocations?: ToolLocation[]
  /** 后端段落标识：同一 content/thinking 段的所有 chunk 共享 segmentId（前端按此复用本地行） */
  segmentId?: string
  /** 段落序号：仅新建段落时由后端分配（追加 chunk 时为 undefined），保证回合内排序一致 */
  seq?: number
}

/**
 * 流式事件回调集合（Agent 策略执行器通过 onEvent 上报，ConversationService 分发）
 */
export interface AgentStrategy {
  /** 策略名称 */
  readonly name: string

  /**
   * @param agent 智能体配置
   */
  supports(agent: AgentConfig): boolean

  /**
   * @param context 对话上下文
   * @param onEvent 事件回调
   */
  execute(context: ConversationContext, onEvent: (event: StreamEvent) => void): Promise<void>

  /**
   */
  abort(sessionId?: string): void
}

/**
 */
export interface ExecutionRequest {
  sessionId: string
  /** 回合 ID：user 消息与其触发的所有 assistant 事件共享 */
  requestId: string
  planId?: string
  agentType: 'acp'
  provider: string
  acpCommand?: string
  modelId?: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    attachments?: MessageAttachment[]
  }>
  workingDirectory?: string
  allowedTools?: string[]
  systemPrompt?: string
  maxTokens?: number
  tools?: ToolDefinition[]
  jsonSchema?: string
  mcpServers?: McpServerConfig[]
  executionMode?: 'chat' | 'task_split' | 'task_execution' | 'solo_execution'
  responseMode?: 'stream_text' | 'json_once'
  resumeSessionId?: string
  reasoningEffort?: ReasoningEffortLevel
  /** 记忆库仓库运行时：是否向 ACP 会话注入内置 MCP 工具（查询对话历史）。 */
  internalToolsEnabled?: boolean
  /** 记忆库仓库 ID，决定内置工具查询的数据源范围（配合 internalToolsEnabled）。 */
  repoId?: string
}

export interface MessageInput {
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: MessageAttachment[]
}

/**
 * 后端流式事件（CLI/SDK 共用）
 */
export interface BackendStreamEvent {
  /** 事件类型 */
  type: 'content' | 'tool_use' | 'tool_input_delta' | 'tool_result' | 'error' | 'done' | 'thinking' | 'thinking_start' | 'reasoning' | 'reasoning_start' | 'file_edit' | 'usage' | 'message_start' | 'system' | 'plan' | 'available_commands' | 'session_started' | 'permission_request' | 'context_window'
  /** 会话 ID */
  sessionId: string
  /** 回合 ID（与触发它的 user 消息共享） */
  requestId?: string
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
  error?: string
  /** 输入 token 数量 */
  inputTokens?: number
  /** 输出 token 数量 */
  outputTokens?: number
  rawInputTokens?: number
  rawOutputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  /** 模型名称 */
  model?: string
  fileEdit?: FileEditTrace
  externalSessionId?: string
  /** ACP 权限询问时携带的可选项（仅 permission_request 事件使用） */
  permissionOptions?: PermissionOption[]
  /** 工具语义类别（read/edit/delete/move/search/execute/think/fetch/switch_mode/other） */
  toolKind?: string
  /** 工具访问/修改的文件位置（透传 ACP ToolCallLocation） */
  toolLocations?: ToolLocation[]
  /** 后端段落标识：同一 content/thinking 段的所有 chunk 共享 segmentId（前端按此复用本地行） */
  segmentId?: string
  /** 段落序号：仅新建段落时由后端分配（追加 chunk 时为 undefined），保证回合内排序一致 */
  seq?: number
}

/**
 * 工具访问/修改的文件位置（对应后端 ToolLocationView）
 */
export interface ToolLocation {
  /** 绝对路径 */
  path: string
  /** 相对工作目录的展示路径 */
  relativePath: string
  /** 可选行号 */
  line?: number
}

export type CliStreamEvent = BackendStreamEvent
export type SdkStreamEvent = BackendStreamEvent
export type AcpStreamEvent = BackendStreamEvent

/** ACP 权限选项（对应后端 PermissionOptionView） */
export interface PermissionOption {
  optionId: string
  name: string
  kind: string
}

/**
 * ACP Agent 下发的可斜杠命令（`AvailableCommand` 的前端视图）。
 *
 * 后端序列化为 `{ name, description, hint }` 的 JSON 数组，通过
 * `available_commands` 流事件下发，供 `/` 斜杠下拉合并为「Agent 命令」分组。
 */
export interface AvailableCommandInfo {
  name: string
  description: string
  /** 输入提示（UnstructuredCommandInput.hint），可能为 null */
  hint?: string | null
}

/**
 * ACP Agent 支持的模型信息（`ModelInfo` 的前端视图）。
 */
export interface ModelInfo {
  id: string
  name: string
  description?: string
}

/**
 * ACP 会话模型状态（`SessionModelState` 的前端视图）。
 */
export interface SessionModels {
  currentModelId?: string
  models: ModelInfo[]
}

/** ACP 计划条目优先级 */
export type AgentPlanPriority = 'high' | 'medium' | 'low'

/** ACP 计划条目状态 */
export type AgentPlanStatus = 'pending' | 'in_progress' | 'completed'

/** ACP Agent Plan 条目（`PlanEntry` 的前端视图） */
export interface AgentPlanEntry {
  content: string
  priority: AgentPlanPriority
  status: AgentPlanStatus
}

/**
 * ACP Agent Plan（`Plan` 的前端视图）。
 *
 * 协议语义为「全量替换」：每次更新即整份计划，前端整体替换即可。
 */
export interface AgentPlan {
  entries: AgentPlanEntry[]
}
