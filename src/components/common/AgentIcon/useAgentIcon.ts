import { computed } from 'vue'
import type { SubAgentCategory } from '@/stores/subAgent'

type AgentIconKind = SubAgentCategory | 'solo-coordinator'

export interface AgentIconProps {
  kind?: AgentIconKind
  size?: number | string
}

export function useAgentIcon(props: AgentIconProps) {
  const normalizedSize = computed(() =>
    typeof props.size === 'number' ? `${props.size}px` : props.size
  )

  return {
    normalizedSize
  }
}
