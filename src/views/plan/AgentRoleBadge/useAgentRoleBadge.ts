import { computed } from 'vue'
import type { AgentRole } from '@/types/plan'
import { getAgentRoleConfig } from '@/types/plan'
import AgentIcon from '@/components/common/AgentIcon/AgentIcon.vue'

export interface AgentRoleBadgeProps {
  role: AgentRole
  size?: 'sm' | 'md' | 'lg'
}

export function useAgentRoleBadge(props: AgentRoleBadgeProps) {
  const size = computed(() => props.size || 'md')

  const roleConfig = computed(() => getAgentRoleConfig(props.role))

  const iconSize = computed(() => {
    const sizeMap = {
      sm: 13,
      md: 15,
      lg: 17
    } as const
    return sizeMap[size.value]
  })

  const roleColors: Record<AgentRole, string> = {
    planner: 'neutral'
  }

  return {
    size,
    roleConfig,
    iconSize,
    roleColors,
    AgentIcon
  }
}
