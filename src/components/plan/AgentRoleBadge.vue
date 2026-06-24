<script setup lang="ts">
import { computed } from 'vue'
import type { AgentRole } from '@/types/plan'
import { getAgentRoleConfig } from '@/types/plan'
import AgentIcon from '@/components/common/AgentIcon.vue'

const props = defineProps<{
  role: AgentRole
  size?: 'sm' | 'md' | 'lg'
}>()

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
</script>

<template>
  <div
    v-if="roleConfig"
    class="agent-role-badge"
    :class="[roleColors[role], size]"
    :title="roleConfig.description"
  >
    <AgentIcon
      class="role-icon"
      kind="planner"
      :size="iconSize"
    />
    <span class="role-name">{{ roleConfig.name }}</span>
  </div>
</template>

<style scoped>
.agent-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.agent-role-badge.sm {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
}

.agent-role-badge.md {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.agent-role-badge.lg {
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
}

.agent-role-badge.neutral {
  background: color-mix(in srgb, var(--color-text-primary) 5%, transparent);
  color: var(--color-text-secondary);
  border: 1px solid color-mix(in srgb, var(--color-text-primary) 9%, transparent);
}

.role-icon {
  color: var(--color-text-primary);
  opacity: 0.82;
}

.role-name {
  white-space: nowrap;
}
</style>
