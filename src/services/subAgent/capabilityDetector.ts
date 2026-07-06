/** 子代理原生委派能力探测（按 provider 判断是否支持 CLI 原生子代理委派）。 */
import type { AgentConfig } from '@/stores/agent'

/**
 * 子代理原生委派能力探测。
 *
 * 方案 B 的核心约束：ACP 协议不传输子代理定义，子代理必须由 CLI 承载。
 * - claude-code：支持 Agent 工具委派（`.claude/agents/*.md`），可并行派生多个子代理。
 * - opencode：支持 primary/subagent + Task 工具（`.opencode/agents/*.md`）。
 * - codex：当前未证实支持子代理委派，降级为单 persona 注入（不出现子代理配置 UI）。
 */
const NATIVE_DELEGATION_PROVIDERS = new Set(['claude', 'opencode'])

/**
 * 判断指定 provider 是否支持 CLI 原生子代理委派。
 */
export function supportsNativeDelegation(provider?: string | null): boolean {
  return Boolean(provider && NATIVE_DELEGATION_PROVIDERS.has(provider))
}

/**
 * 从执行器列表中筛出支持子代理委派的执行器（供设置页/创建入口使用）。
 */
export function filterDelegationCapableAgents(agents: AgentConfig[]): AgentConfig[] {
  return agents.filter(agent => supportsNativeDelegation(agent.provider))
}
