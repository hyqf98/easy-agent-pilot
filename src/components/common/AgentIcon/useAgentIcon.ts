/** useAgentIcon — AgentIcon 组件的 composable，负责代理图标尺寸（数字→px）的归一化派生状态。 */
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
