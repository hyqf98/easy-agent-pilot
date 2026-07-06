/** 智能体运行时画像（各 provider ACP）定义与执行请求构建。 */
import type { AgentConfig, AgentProvider, AgentType } from '@/stores/agent'
import { inferAgentProvider } from '@/stores/agent'
import { appendClaudeMcpAllowedTools } from '@/utils/mcpServerConfig'
import type { ConversationContext, ExecutionRequest } from './strategies/types'
import type { ReasoningEffortLevel } from '@/types/reasoning'

export type AgentRuntimeKey = 'claude-acp' | 'codex-acp' | 'opencode-acp' | 'custom-acp'
export type AbortCommand = 'abort_agent_execution'

type RuntimeMcpServers = ConversationContext['mcpServers']

interface AgentRuntimeProfileDefinition {
  key: AgentRuntimeKey
  name: string
  agentType: AgentType
  provider: AgentProvider
  abortCommand: AbortCommand
  defaultAcpCommand?: string
  eventName: (sessionId: string) => string
  resolveAllowedTools?: (mcpServers?: RuntimeMcpServers) => string[]
  validate?: (agent: AgentConfig) => string | null
}

const runtimeProfiles: Record<AgentRuntimeKey, AgentRuntimeProfileDefinition> = {
  'claude-acp': {
    key: 'claude-acp',
    name: 'Claude',
    agentType: 'acp',
    provider: 'claude',
    abortCommand: 'abort_agent_execution',
    defaultAcpCommand: 'npx -y --prefer-offline @zed-industries/claude-code-acp@0.16.2',
    eventName: (sessionId) => `acp-stream-${sessionId}`,
    resolveAllowedTools: (mcpServers) => appendClaudeMcpAllowedTools(
      ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'],
      mcpServers
    ),
    validate: (agent) => {
      if (!agent.acpCommand && !agent.cliPath) {
        return 'ACP 命令未配置，请在智能体设置中配置'
      }
      return null
    }
  },
  'codex-acp': {
    key: 'codex-acp',
    name: 'Codex',
    agentType: 'acp',
    provider: 'codex',
    abortCommand: 'abort_agent_execution',
    defaultAcpCommand: 'npx -y --prefer-offline @zed-industries/codex-acp@0.14.0',
    eventName: (sessionId) => `acp-stream-${sessionId}`,
    resolveAllowedTools: () => ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    validate: (agent) => {
      if (!agent.acpCommand && !agent.cliPath) {
        return 'ACP 命令未配置，请在智能体设置中配置'
      }
      return null
    }
  },
  'opencode-acp': {
    key: 'opencode-acp',
    name: 'OpenCode',
    agentType: 'acp',
    provider: 'opencode',
    abortCommand: 'abort_agent_execution',
    defaultAcpCommand: 'opencode acp',
    eventName: (sessionId) => `acp-stream-${sessionId}`,
    resolveAllowedTools: (mcpServers) => appendClaudeMcpAllowedTools(
      ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'],
      mcpServers
    ),
    validate: (agent) => {
      if (!agent.acpCommand && !agent.cliPath) {
        return 'ACP 命令未配置，请在智能体设置中配置'
      }
      return null
    }
  },
  'custom-acp': {
    key: 'custom-acp',
    name: 'Custom Agent',
    agentType: 'acp',
    provider: 'custom',
    abortCommand: 'abort_agent_execution',
    eventName: (sessionId) => `acp-stream-${sessionId}`,
    validate: (agent) => {
      if (!agent.acpCommand && !agent.cliPath) {
        return 'ACP 命令未配置，请在智能体设置中配置'
      }
      return null
    }
  }
}

function normalizeRuntimeProvider(agent: Pick<AgentConfig, 'type' | 'provider' | 'name' | 'cliPath' | 'acpCommand'>): AgentProvider | undefined {
  return inferAgentProvider(agent) ?? 'custom'
}

function normalizeRuntimeKey(agent: Pick<AgentConfig, 'type' | 'provider' | 'name' | 'cliPath' | 'acpCommand'>): AgentRuntimeKey {
  const provider = normalizeRuntimeProvider(agent)
  return `${provider}-acp` as AgentRuntimeKey
}

function normalizeModelId(modelId?: string): string | undefined {
  const normalized = modelId?.trim()
  if (!normalized || normalized === 'default') {
    return undefined
  }
  return normalized
}

export function getAgentRuntimeProfile(runtimeKey: AgentRuntimeKey): AgentRuntimeProfileDefinition {
  return runtimeProfiles[runtimeKey]
}

export function resolveAgentRuntimeProfile(
  agent: Pick<AgentConfig, 'type' | 'provider' | 'name' | 'cliPath' | 'acpCommand'>
): AgentRuntimeProfileDefinition | null {
  const runtimeKey = normalizeRuntimeKey(agent)
  return runtimeProfiles[runtimeKey] ?? null
}

export function matchesAgentRuntimeProfile(
  agent: Pick<AgentConfig, 'type' | 'provider' | 'name' | 'cliPath' | 'acpCommand'>,
  runtimeKey: AgentRuntimeKey
): boolean {
  return normalizeRuntimeKey(agent) === runtimeKey
}

export function validateAgentRuntime(
  agent: AgentConfig,
  runtimeKey: AgentRuntimeKey
): string | null {
  return runtimeProfiles[runtimeKey].validate?.(agent) ?? null
}

interface BuildAgentExecutionRequestOptions {
  sessionId: string
  /** 回合 ID：user 消息与其触发的所有 assistant 事件共享 */
  requestId?: string
  planId?: string
  agent: AgentConfig
  messages: ExecutionRequest['messages']
  workingDirectory?: string
  mcpServers?: ExecutionRequest['mcpServers']
  tools?: ExecutionRequest['tools']
  executionMode?: ExecutionRequest['executionMode']
  responseMode?: ExecutionRequest['responseMode']
  modelId?: string
  systemPrompt?: string
  maxTokens?: number
  resumeSessionId?: string
  reasoningEffort?: ReasoningEffortLevel
  jsonSchema?: string
  internalToolsEnabled?: boolean
  repoId?: string
}

export function buildAgentExecutionRequest(
  options: BuildAgentExecutionRequestOptions
): ExecutionRequest {
  const profile = resolveAgentRuntimeProfile(options.agent)
  if (!profile) {
    throw new Error(`不支持的智能体类型: ${options.agent.type} (${options.agent.provider || 'unknown'})`)
  }

  const modelId = normalizeModelId(options.modelId ?? options.agent.modelId)

  return {
    sessionId: options.sessionId,
    requestId: options.requestId ?? crypto.randomUUID(),
    planId: options.planId,
    agentType: profile.agentType,
    provider: profile.provider,
    acpCommand: options.agent.acpCommand || options.agent.cliPath || profile.defaultAcpCommand,
    modelId,
    messages: options.messages,
    workingDirectory: options.workingDirectory,
    allowedTools: profile.resolveAllowedTools?.(options.mcpServers),
    systemPrompt: options.systemPrompt,
    maxTokens: options.maxTokens,
    tools: options.tools,
    jsonSchema: options.jsonSchema,
    mcpServers: options.mcpServers,
    executionMode: options.executionMode ?? 'chat',
    responseMode: options.responseMode ?? 'stream_text',
    resumeSessionId: options.resumeSessionId,
    reasoningEffort: options.reasoningEffort,
    internalToolsEnabled: options.internalToolsEnabled,
    repoId: options.repoId
  }
}
