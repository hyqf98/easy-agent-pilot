<script setup lang="ts">
import { computed } from 'vue'
import type { AgentRole } from '@/types/plan'
import { getAgentRoleConfig } from '@/types/plan'

const props = defineProps<{
  role: AgentRole
  size?: 'sm' | 'md' | 'lg'
}>()

const size = computed(() => props.size || 'md')

const roleConfig = computed(() => getAgentRoleConfig(props.role))

const roleColors: Record<AgentRole, string> = {
  planner: 'purple'
}

const roleIcons: Record<AgentRole, string> = {
  planner: '📋'
}
</script>

<template>
  <div
    v-if="roleConfig"
    class="agent-role-badge"
    :class="[roleColors[role], size]"
    :title="roleConfig.description"
  >
    <span class="role-icon">{{ roleIcons[role] }}</span>
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

.agent-role-badge.purple {
  background-color: #f3e8ff;
  color: #7c3aed;
}

.agent-role-badge.blue {
  background-color: #eff6ff;
  color: #2563eb;
}

.agent-role-badge.green {
  background-color: #ecfdf5;
  color: #059669;
}

.agent-role-badge.orange {
  background-color: #fff7ed;
  color: #ea580c;
}

.role-icon {
  font-size: 0.875em;
}

.role-name {
  white-space: nowrap;
}
</style>
