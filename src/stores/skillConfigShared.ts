/**
 * skillConfigShared.ts
 *
 * 职责：集中存放 useSkillConfigStore 的「纯模块级」代码，与 taskExecutionShared.ts /
 * taskSplitShared.ts / soloExecutionShared.ts / unattendedShared.ts 范式对齐。
 *   - 接口 / 类型定义（UnifiedConfigItem / UnifiedMcpConfig / UnifiedSkillConfig /
 *     UnifiedPluginConfig / CliConfig / RawAgent*Config / Mcp*Result 等）
 *   - 纯函数 helper（DB / CLI 扫描结果 → 领域模型转换、同步预览项构造、
 *     MCP 配置输入构造、agent CLI 路径解析、agent 配置 CRUD 的 snake_case 输入构造）
 *
 * 主 store（skillConfig.ts）只负责响应式状态、Tauri invoke 与错误通知，所有无副作用、
 * 可复用的逻辑沉淀于此，通过 `import { ... } from './skillConfigShared'` 引用。
 */
import type { AgentConfig } from './agent'

export type ConfigSource = 'database' | 'file'

export interface UnifiedConfigItem {
  id: string
  name: string
  enabled: boolean
  source: ConfigSource
  isReadOnly: boolean
}

export type McpTransportType = 'stdio' | 'sse' | 'http' | 'builtin'

export type McpConfigScope = 'user' | 'local' | 'project'

export interface UnifiedMcpConfig extends UnifiedConfigItem {
  transportType: McpTransportType
  scope: McpConfigScope
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface UnifiedSkillConfig extends UnifiedConfigItem {
  description?: string
  skillPath: string
  scriptsPath?: string
  referencesPath?: string
  assetsPath?: string
}

export interface UnifiedPluginConfig extends UnifiedConfigItem {
  version?: string
  description?: string
  pluginPath: string
}

export interface CliConfigPaths {
  configDir: string
  configFile: string
  cliType: string
  skillsDir: string
}

export interface SkillReferenceDraft {
  title: string
  summary?: string
  content: string
}

export interface CreateVisualSkillInput {
  name: string
  description?: string
  instructions: string
  references: SkillReferenceDraft[]
  includeScriptsDir?: boolean
  includeAssetsDir?: boolean
}

export interface CreatedCliSkillResult {
  skillPath: string
  skillFilePath: string
  referencesPath?: string
  scriptsPath?: string
  assetsPath?: string
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolsListResult {
  success: boolean
  message: string
  tools: McpTool[]
}

export interface McpToolCallResult {
  success: boolean
  message: string
  result: Record<string, unknown>
  error?: string
}

export interface McpConfigInput {
  name: string
  transport_type: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface CliCapabilities {
  supportsMcp: boolean
  supportsSkills: boolean
  supportsPlugins: boolean
  mcpAddCommand: string | null
}

export type SyncConfigType = 'mcp' | 'skills'
export type CliSyncConflictPolicy = 'skip'

export interface CliSyncPreviewItem {
  name: string
  type: SyncConfigType
  description?: string
  path?: string
  transportType?: 'stdio' | 'sse' | 'http'
}

export interface CliSyncItemIssue {
  name: string
  reason: string
}

export interface CliSyncResult {
  successCount: number
  skippedCount: number
  failedCount: number
  createdItems: string[]
  skippedItems: CliSyncItemIssue[]
  failedItems: CliSyncItemIssue[]
}

export interface ScannedMcpServer {
  name: string
  transport: 'stdio' | 'sse' | 'http'
  scope: 'user' | 'local' | 'project'
  disabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface ScannedSkill {
  name: string
  path: string
  description: string | null
  frontmatter_name: string | null
  subdirectories: {
    has_scripts: boolean
    has_references: boolean
    has_assets: boolean
  }
}

export interface ScannedPlugin {
  name: string
  path: string
  enabled: boolean
  version: string | null
  description: string | null
  author: string | null
  subdirectories: {
    has_agents: boolean
    has_commands: boolean
    has_skills: boolean
    has_hooks: boolean
    has_scripts: boolean
  }
}

export interface ClaudeConfigScanResult {
  claude_dir: string
  mcp_servers: ScannedMcpServer[]
  skills: ScannedSkill[]
  plugins: ScannedPlugin[]
  scan_success: boolean
  error_message: string | null
}

export interface CliConfig {
  mcp_servers?: Record<string, CliMcpServerConfig>
  mcpServers?: Record<string, CliMcpServerConfig>
}

export interface CliMcpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled?: boolean
}

export interface RawAgentMcpConfig {
  id: string
  agent_id: string
  name: string
  transport_type: string
  command?: string
  args?: string
  env?: string
  url?: string
  headers?: string
  scope: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface RawAgentSkillsConfig {
  id: string
  agent_id: string
  name: string
  description?: string
  skill_path: string
  scripts_path?: string
  references_path?: string
  assets_path?: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface RawAgentPluginsConfig {
  id: string
  agent_id: string
  name: string
  version?: string
  description?: string
  plugin_path: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export function transformDbMcpConfig(raw: RawAgentMcpConfig): UnifiedMcpConfig {
  return {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled,
    source: 'database',
    isReadOnly: false,
    transportType: raw.transport_type as McpTransportType,
    scope: raw.scope as McpConfigScope,
    command: raw.command,
    args: raw.args ? raw.args.split('\n').filter(Boolean) : undefined,
    env: raw.env ? JSON.parse(raw.env) : undefined,
    url: raw.url,
    headers: raw.headers ? JSON.parse(raw.headers) : undefined,
  }
}

export function transformDbSkillsConfig(raw: RawAgentSkillsConfig): UnifiedSkillConfig {
  return {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled,
    source: 'database',
    isReadOnly: false,
    description: raw.description,
    skillPath: raw.skill_path,
    scriptsPath: raw.scripts_path,
    referencesPath: raw.references_path,
    assetsPath: raw.assets_path,
  }
}

export function transformDbPluginsConfig(raw: RawAgentPluginsConfig): UnifiedPluginConfig {
  return {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled,
    source: 'database',
    isReadOnly: false,
    version: raw.version,
    description: raw.description,
    pluginPath: raw.plugin_path,
  }
}

export function transformCliMcpConfig(name: string, config: CliMcpServerConfig): UnifiedMcpConfig {
  return {
    id: `cli-${name}`,
    name,
    enabled: !config.disabled,
    source: 'file',
    isReadOnly: true,
    transportType: config.url ? (config.url.includes('/sse') ? 'sse' : 'http') : 'stdio',
    scope: 'user',
    command: config.command,
    args: config.args,
    env: config.env,
    url: config.url,
    headers: config.headers,
  }
}

export function transformScannedCliMcpConfig(server: ScannedMcpServer): UnifiedMcpConfig {
  return {
    id: `cli-${server.scope}-${server.name}`,
    name: server.name,
    enabled: !server.disabled,
    source: 'file',
    isReadOnly: true,
    transportType: server.transport,
    scope: server.scope,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    headers: server.headers,
  }
}

export function transformCliSkill(skill: ScannedSkill): UnifiedSkillConfig {
  return {
    id: `cli-skill-${skill.path}`,
    name: skill.name,
    enabled: true,
    source: 'file',
    isReadOnly: true,
    description: skill.description || undefined,
    skillPath: skill.path,
    scriptsPath: skill.subdirectories.has_scripts ? `${skill.path}/scripts` : undefined,
    referencesPath: skill.subdirectories.has_references ? `${skill.path}/references` : undefined,
    assetsPath: skill.subdirectories.has_assets ? `${skill.path}/assets` : undefined,
  }
}

export function transformCliPlugin(plugin: ScannedPlugin): UnifiedPluginConfig {
  return {
    id: `cli-plugin-${plugin.path}`,
    name: plugin.name,
    enabled: plugin.enabled,
    source: 'file',
    isReadOnly: true,
    version: plugin.version || undefined,
    description: plugin.description || undefined,
    pluginPath: plugin.path,
  }
}

export function buildSyncPreviewItems(
  scanResult: ClaudeConfigScanResult,
  type: SyncConfigType
): CliSyncPreviewItem[] {
  if (type === 'mcp') {
    return scanResult.mcp_servers.map(server => ({
      name: server.name,
      type,
      path: server.url || server.command,
      transportType: server.transport,
    }))
  }

  return scanResult.skills.map(skill => ({
    name: skill.name,
    type,
    description: skill.description || undefined,
    path: skill.path,
  }))
}

export function buildMcpConfigInput(config: UnifiedMcpConfig): McpConfigInput {
  return {
    name: config.name,
    transport_type: config.transportType,
    command: config.command,
    args: config.args,
    env: config.env,
    url: config.url,
    headers: config.headers,
  }
}

/**
 * 解析智能体实际可用的 CLI 入口：优先 acpCommand，其次 cliPath，最后回退到 provider。
 * 全 store 多处复用（selectAgent / loadCliConfigs / createMcpConfig 等）。
 */
export function resolveAgentCliPath(
  agent: Pick<AgentConfig, 'acpCommand' | 'cliPath' | 'provider'>
): string {
  return agent.acpCommand || agent.cliPath || agent.provider || ''
}

/**
 * 构造 CLI MCP 配置更新 payload（command/args/env/url/headers/disabled）。
 * create 与 update 路径共用此结构。
 */
export function buildCliMcpUpdateConfig(
  config: Pick<UnifiedMcpConfig, 'command' | 'args' | 'env' | 'url' | 'headers' | 'enabled'>
): {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled: boolean
} {
  return {
    command: config.command,
    args: config.args,
    env: config.env,
    url: config.url,
    headers: config.headers,
    disabled: !config.enabled,
  }
}

/** 构造 SDK MCP 配置创建输入（snake_case，写入数据库） */
export function buildAgentMcpCreateInput(
  agentId: string,
  config: Pick<UnifiedMcpConfig, 'name' | 'transportType' | 'command' | 'args' | 'env' | 'url' | 'headers' | 'scope'>
): {
  agent_id: string
  name: string
  transport_type: string
  command?: string
  args?: string
  env?: string
  url?: string
  headers?: string
  scope: string
} {
  return {
    agent_id: agentId,
    name: config.name,
    transport_type: config.transportType,
    command: config.command,
    args: config.args?.join('\n'),
    env: config.env ? JSON.stringify(config.env) : undefined,
    url: config.url,
    headers: config.headers ? JSON.stringify(config.headers) : undefined,
    scope: config.scope,
  }
}

/** 构造 SDK MCP 配置更新输入（snake_case，部分字段可缺省） */
export function buildAgentMcpUpdateInput(
  updates: Partial<Pick<UnifiedMcpConfig, 'name' | 'transportType' | 'command' | 'args' | 'env' | 'url' | 'headers' | 'scope' | 'enabled'>>
): {
  name?: string
  transport_type?: string
  command?: string
  args?: string
  env?: string
  url?: string
  headers?: string
  scope?: string
  enabled?: boolean
} {
  return {
    name: updates.name,
    transport_type: updates.transportType,
    command: updates.command,
    args: updates.args?.join('\n'),
    env: updates.env ? JSON.stringify(updates.env) : undefined,
    url: updates.url,
    headers: updates.headers ? JSON.stringify(updates.headers) : undefined,
    scope: updates.scope,
    enabled: updates.enabled,
  }
}

/** 构造 SDK Skills 配置创建输入（snake_case，写入数据库） */
export function buildAgentSkillsCreateInput(
  agentId: string,
  config: Pick<UnifiedSkillConfig, 'name' | 'description' | 'skillPath' | 'scriptsPath' | 'referencesPath' | 'assetsPath'>
): {
  agent_id: string
  name: string
  description?: string
  skill_path: string
  scripts_path?: string
  references_path?: string
  assets_path?: string
} {
  return {
    agent_id: agentId,
    name: config.name,
    description: config.description,
    skill_path: config.skillPath,
    scripts_path: config.scriptsPath,
    references_path: config.referencesPath,
    assets_path: config.assetsPath,
  }
}

/** 构造 SDK Skills 配置更新输入（snake_case，部分字段可缺省） */
export function buildAgentSkillsUpdateInput(
  updates: Partial<Pick<UnifiedSkillConfig, 'name' | 'description' | 'skillPath' | 'scriptsPath' | 'referencesPath' | 'assetsPath' | 'enabled'>>
): {
  name?: string
  description?: string
  skill_path?: string
  scripts_path?: string
  references_path?: string
  assets_path?: string
  enabled?: boolean
} {
  return {
    name: updates.name,
    description: updates.description,
    skill_path: updates.skillPath,
    scripts_path: updates.scriptsPath,
    references_path: updates.referencesPath,
    assets_path: updates.assetsPath,
    enabled: updates.enabled,
  }
}

/** 构造 SDK Plugins 配置创建输入（snake_case，写入数据库） */
export function buildAgentPluginsCreateInput(
  agentId: string,
  config: Pick<UnifiedPluginConfig, 'name' | 'version' | 'description' | 'pluginPath'>
): {
  agent_id: string
  name: string
  version?: string
  description?: string
  plugin_path: string
} {
  return {
    agent_id: agentId,
    name: config.name,
    version: config.version,
    description: config.description,
    plugin_path: config.pluginPath,
  }
}

/** 构造 SDK Plugins 配置更新输入（snake_case，部分字段可缺省） */
export function buildAgentPluginsUpdateInput(
  updates: Partial<Pick<UnifiedPluginConfig, 'name' | 'version' | 'description' | 'pluginPath' | 'enabled'>>
): {
  name?: string
  version?: string
  description?: string
  plugin_path?: string
  enabled?: boolean
} {
  return {
    name: updates.name,
    version: updates.version,
    description: updates.description,
    plugin_path: updates.pluginPath,
    enabled: updates.enabled,
  }
}
