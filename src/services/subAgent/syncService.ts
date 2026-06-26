import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import type { SubAgent } from '@/stores/subAgent'
import { supportsNativeDelegation } from './capabilityDetector'

/** 写盘结果（与 Rust `SyncSubAgentFilesResult` 对齐）。 */
interface SyncSubAgentFilesResult {
  written: string[]
  cleared: string[]
}

/** 传给后端的单个子代理文件定义（camelCase，对齐 Rust 反序列化）。 */
interface SubAgentFileInput {
  key: string
  name: string
  description?: string
  prompt: string
  tools: string[]
  disallowedTools: string[]
  model?: string
  permissionMode?: string
  maxTurns?: number
}

function toFileInput(subAgent: SubAgent): SubAgentFileInput {
  return {
    // 用 builtinCode 作为稳定文件名（内置子代理），自定义子代理回退 id
    key: subAgent.builtinCode || subAgent.id,
    name: subAgent.name,
    description: subAgent.description,
    prompt: subAgent.prompt,
    tools: subAgent.tools,
    disallowedTools: subAgent.disallowedTools,
    model: subAgent.model,
    permissionMode: subAgent.permissionMode,
    maxTurns: subAgent.maxTurns
  }
}

/**
 * 把启用子代理集合写盘成 CLI 原生配置（`.claude/agents/` 或 `.opencode/agents/`）。
 *
 * 仅在执行器支持原生委派（claude/opencode）时执行；codex 等不支持的 provider
 * 直接跳过（降级为单 persona 注入）。只写 `ea-` 前缀标记文件，不覆盖用户手写配置。
 *
 * @returns 写盘的文件路径列表；不支持或无子代理时返回空数组。
 */
export async function syncSubAgentFiles(
  executor: AgentConfig,
  subAgents: SubAgent[],
  projectPath?: string | null
): Promise<string[]> {
  if (!supportsNativeDelegation(executor.provider)) {
    return []
  }
  const enabled = subAgents.filter(subAgent => subAgent.isEnabled)
  if (enabled.length === 0) {
    return []
  }

  const result = await invoke<SyncSubAgentFilesResult>('sync_sub_agent_files', {
    input: {
      provider: executor.provider,
      projectPath: projectPath || null,
      // userHome 留空，由后端自动解析当前用户主目录
      userHome: null,
      subAgents: enabled.map(toFileInput)
    }
  })
  return result.written
}

/**
 * 清理指定执行器/项目下的所有 `ea-` 标记子代理文件。
 * 在会话结束或子代理全部禁用时调用。
 */
export async function clearSubAgentFiles(
  executor: AgentConfig,
  projectPath?: string | null
): Promise<string[]> {
  if (!supportsNativeDelegation(executor.provider)) {
    return []
  }
  return invoke<string[]>('clear_sub_agent_files', {
    input: {
      provider: executor.provider,
      projectPath: projectPath || null,
      userHome: null
    }
  })
}
