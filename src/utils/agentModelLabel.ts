/** 智能体模型显示标签（provider、modelId、displayName）格式化。 */
import type { AgentProvider } from '@/stores/agent'

interface AgentModelLabelInput {
  provider?: AgentProvider | null
  modelId?: string | null
  displayName?: string | null
}

export function formatAgentModelLabel(input: AgentModelLabelInput): string {
  const modelId = input.modelId?.trim() || ''
  const displayName = input.displayName?.trim() || ''

  if (input.provider === 'opencode') {
    return modelId || displayName || '使用默认模型'
  }

  return displayName || modelId || '使用默认模型'
}
