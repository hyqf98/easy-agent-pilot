/** 子代理执行运行时：解析上下文并构建子代理系统提示词。 */
import type { AgentConfig } from '@/stores/agent'
import type { SubAgent } from '@/stores/subAgent'

const SUB_AGENT_RUNTIME_BASELINE = [
  '你当前以被分配子代理的身份工作，不是泛化闲聊助手。',
  '先理解目标、上下文、约束和当前阶段，再输出结论或执行建议。',
  '优先给出可执行、可验证、可交接的结果，避免空泛描述。',
  '如果信息已经足够，就继续推进；如果信息不足，只补充继续当前工作所必须的关键问题。',
  '输出要尽量落到模块、页面、文件、状态、命令、验证方式或风险点。'
].join('\n')

/**
 * 解析后的子代理执行上下文。
 *
 * 子代理不再持有执行器绑定（runtimeAgentId 已移除），执行器来自会话/计划/SOLO 选定，
 * 由调用方通过 `executorAgent` 传入；模型优先取执行器配置，可选被子代理专用 model 覆盖。
 */
export interface ResolvedSubAgentExecution {
  subAgent: SubAgent
  agent: AgentConfig
  modelId?: string
}

/**
 * 组装子代理执行上下文：载体（执行器）+ 模型来自外部选定值，子代理仅提供 persona。
 *
 * 与旧 `resolveExpertRuntime` 的关键差异：不再回退到 `agents[0]`，执行器必须显式传入。
 * 这是为了把"选哪个 ACP 执行器"的职责干净地上移到会话/计划/SOLO 层。
 */
export function resolveSubAgentExecution(
  subAgent: SubAgent | null | undefined,
  executorAgent: AgentConfig | null | undefined,
  modelIdOverride?: string | null
): ResolvedSubAgentExecution | null {
  if (!subAgent || !executorAgent) {
    return null
  }

  return {
    subAgent,
    agent: executorAgent,
    modelId: modelIdOverride?.trim() || subAgent.model || executorAgent.modelId
  }
}

/**
 * 兼容旧 `resolveExpertRuntime` 调用习惯的便捷解析：执行器回退到 `agents[0]`。
 *
 * 用于迁移期：会话/计划/SOLO 旧调用点尚未显式选定执行器时使用。
 * 新创建流程（Phase C）应直接调用 `resolveSubAgentExecution` 传入显式执行器。
 */
export function resolveSubAgentExecutionWithFallback(
  subAgent: SubAgent | null | undefined,
  agents: AgentConfig[],
  modelIdOverride?: string | null
): ResolvedSubAgentExecution | null {
  if (!subAgent) {
    return null
  }
  return resolveSubAgentExecution(subAgent, resolveFallbackAgent(agents), modelIdOverride)
}

export function resolveSubAgentById(
  subAgentId: string | null | undefined,
  subAgents: SubAgent[]
): SubAgent | null {
  if (!subAgentId) {
    return null
  }

  return subAgents.find(subAgent => subAgent.id === subAgentId) || null
}

export function resolveFallbackAgent(agents: AgentConfig[]): AgentConfig | null {
  return agents[0] || null
}

/**
 * 构造子代理系统 Prompt：baseline + 子代理 persona + 可选的内部补充片段。
 * 该结果会经 ACP `_meta.systemPrompt` 注入给会话选定的执行器。
 */
export function buildSubAgentSystemPrompt(
  subAgentPrompt: string | null | undefined,
  internalPrompts: Array<string | null | undefined> = []
): string {
  return [SUB_AGENT_RUNTIME_BASELINE, subAgentPrompt?.trim(), ...internalPrompts.map(prompt => prompt?.trim())]
    .filter((prompt): prompt is string => Boolean(prompt))
    .join('\n\n')
    .trim()
}

/**
 * 构造子代理清单 Prompt（供任务拆分/调度使用）。
 *
 * 与旧版本差异：不再输出"运行时"行（子代理不再绑定执行器，执行器由会话/计划选定）。
 */
export function buildSubAgentCatalogPrompt(subAgents: SubAgent[]): string {
  if (subAgents.length === 0) {
    return '当前没有可用的子代理配置。'
  }

  const lines = [
    '当前可分配的子代理如下，请根据任务目标、技能类型、交付物形态和验证责任，为每个任务选择最合适的 expertId（子代理 ID）：',
    '',
    '分配原则：',
    '- 优先把任务分给最贴合主职责的子代理，而不是默认分给通用或开发子代理',
    '- 如果任务跨越多个技能域，应优先继续拆分，而不是让一个任务承担多种子代理职责',
    '- 只有当该 expertId 明确适合当前任务时再分配；不要为了填充字段而随意选择',
    ''
  ]

  subAgents.forEach(subAgent => {
    lines.push(`- expertId: ${subAgent.id}`)
    lines.push(`  名称: ${subAgent.name}`)
    lines.push(`  描述: ${subAgent.description || '（无）'}`)
    lines.push(`  分类: ${subAgent.category}`)
    lines.push(`  标签: ${(subAgent.tags || []).join(', ') || '（无）'}`)
    lines.push(`  推荐场景: ${(subAgent.recommendedScenes || []).join(', ') || '（无）'}`)
    lines.push('')
  })

  lines.push('输出 task_split 时，每个任务必须填入 expertId，并保证该 expertId 与任务目标、技能边界和验证责任一致。')
  return lines.join('\n').trim()
}

export function buildRuntimeAddonPrompt(lines: string[]): string | null {
  const normalized = lines.map(line => line.trim()).filter(Boolean)
  if (normalized.length === 0) {
    return null
  }
  return normalized.join('\n')
}
