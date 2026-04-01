import type { AgentConfig } from '@/stores/agent'
import type { AgentExpert } from '@/stores/agentTeams'
import type { ModelOption } from '@/components/plan/planListShared'

const EXPERT_RUNTIME_BASELINE = [
  '你当前以被分配专家的身份工作，不是泛化闲聊助手。',
  '先理解目标、上下文、约束和当前阶段，再输出结论或执行建议。',
  '优先给出可执行、可验证、可交接的结果，避免空泛描述。',
  '如果信息已经足够，就继续推进；如果信息不足，只补充继续当前工作所必须的关键问题。',
  '输出要尽量落到模块、页面、文件、状态、命令、验证方式或风险点。'
].join('\n')

export interface ResolvedExpertRuntime {
  expert: AgentExpert
  agent: AgentConfig
  modelId?: string
}

export function resolveExpertRuntime(
  expert: AgentExpert | null | undefined,
  agents: AgentConfig[],
  modelIdOverride?: string | null
): ResolvedExpertRuntime | null {
  if (!expert) {
    return null
  }

  const runtimeAgent = (expert.runtimeAgentId
    ? agents.find(agent => agent.id === expert.runtimeAgentId)
    : null) || agents.find(agent => agent.type === 'cli')

  if (!runtimeAgent) {
    return null
  }

  return {
    expert,
    agent: runtimeAgent,
    modelId: modelIdOverride?.trim() || expert.defaultModelId || runtimeAgent.modelId
  }
}

export function resolveExpertById(
  expertId: string | null | undefined,
  experts: AgentExpert[]
): AgentExpert | null {
  if (!expertId) {
    return null
  }

  return experts.find(expert => expert.id === expertId) || null
}

export function resolveFallbackCliAgent(agents: AgentConfig[]): AgentConfig | null {
  return agents.find(agent => agent.type === 'cli') || null
}

export function buildExpertSystemPrompt(
  expertPrompt: string | null | undefined,
  internalPrompts: Array<string | null | undefined> = []
): string {
  return [
    EXPERT_RUNTIME_BASELINE,
    expertPrompt?.trim(),
    ...internalPrompts.map(prompt => prompt?.trim())
  ]
    .filter((prompt): prompt is string => Boolean(prompt))
    .join('\n\n')
    .trim()
}

export function buildExpertCatalogPrompt(experts: AgentExpert[], agents: AgentConfig[]): string {
  if (experts.length === 0) {
    return '当前没有可用的专家团队配置。'
  }

  const lines = [
    '当前可分配的专家团队如下，请根据任务目标、技能类型、交付物形态和验证责任，为每个任务选择最合适的 expertId：',
    '',
    '分配原则：',
    '- 优先把任务分给最贴合主职责的专家，而不是默认分给通用或开发专家',
    '- 如果任务跨越多个技能域，应优先继续拆分，而不是让一个任务承担多种专家职责',
    '- 只有当该 expertId 明确适合当前任务时再分配；不要为了填充字段而随意选择',
    ''
  ]

  experts.forEach(expert => {
    const runtimeAgent = expert.runtimeAgentId
      ? agents.find(agent => agent.id === expert.runtimeAgentId)
      : agents.find(agent => agent.type === 'cli')
    const runtimeName = runtimeAgent?.provider
      ? `${runtimeAgent.provider.toUpperCase()} CLI`
      : runtimeAgent?.name || '未绑定运行时'

    lines.push(`- expertId: ${expert.id}`)
    lines.push(`  名称: ${expert.name}`)
    lines.push(`  描述: ${expert.description || '（无）'}`)
    lines.push(`  分类: ${expert.category}`)
    lines.push(`  标签: ${(expert.tags || []).join(', ') || '（无）'}`)
    lines.push(`  推荐场景: ${(expert.recommendedScenes || []).join(', ') || '（无）'}`)
    lines.push(`  运行时: ${runtimeName}`)
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

export function buildModelOptionsForExpert(
  expert: AgentExpert | null | undefined,
  modelsByAgentId: (agentId: string) => ModelOption[]
): ModelOption[] {
  if (!expert?.runtimeAgentId) {
    return []
  }
  return modelsByAgentId(expert.runtimeAgentId)
}
