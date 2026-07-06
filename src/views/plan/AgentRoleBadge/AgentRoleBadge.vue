<script setup lang="ts">
/** AgentRoleBadge 组件：智能体角色徽章，按角色渲染图标与名称（逻辑见 useAgentRoleBadge.ts） */
import { useAgentRoleBadge, type AgentRoleBadgeProps } from './useAgentRoleBadge'

const props = defineProps<AgentRoleBadgeProps>()

const { size, roleConfig, iconSize, roleColors, AgentIcon } = useAgentRoleBadge(props)
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

<style scoped src="./styles.css"></style>
