<script setup lang="ts">
/** AgentIcon 组件：智能体角色 SVG 图标，按 kind 渲染不同角色图形（逻辑见 useAgentIcon.ts） */
import { useAgentIcon, type AgentIconProps } from './useAgentIcon'

const props = withDefaults(defineProps<AgentIconProps>(), {
  kind: 'custom',
  size: 20
})

const { normalizedSize } = useAgentIcon(props)
</script>

<template>
  <svg
    class="agent-icon"
    :style="{ width: normalizedSize, height: normalizedSize }"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <g
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <template v-if="kind === 'general'">
        <path d="M12 3.75 18.5 7.5v9L12 20.25 5.5 16.5v-9L12 3.75Z" />
        <path
          class="agent-icon__muted"
          d="M12 8.5v7M8.95 10.25l6.1 3.5M15.05 10.25l-6.1 3.5"
        />
        <circle
          cx="12"
          cy="12"
          r="1.9"
        />
      </template>

      <template v-else-if="kind === 'solo-coordinator'">
        <circle
          cx="12"
          cy="12"
          r="2.35"
        />
        <path
          class="agent-icon__muted"
          d="M12 5.25v4.4M12 14.35v4.4M5.25 12h4.4M14.35 12h4.4"
        />
        <circle
          cx="12"
          cy="4.5"
          r="1.25"
        />
        <circle
          cx="12"
          cy="19.5"
          r="1.25"
        />
        <circle
          cx="4.5"
          cy="12"
          r="1.25"
        />
        <circle
          cx="19.5"
          cy="12"
          r="1.25"
        />
      </template>

      <template v-else-if="kind === 'planner'">
        <path d="M6 6.25h4.4c3.8 0 5.6 1.8 5.6 5.55v5.95" />
        <path
          class="agent-icon__muted"
          d="M10.75 12H18M15.5 9.5 18 12l-2.5 2.5"
        />
        <circle
          cx="5"
          cy="6.25"
          r="1.65"
        />
        <circle
          cx="18"
          cy="17.75"
          r="1.65"
        />
      </template>

      <template v-else-if="kind === 'architect'">
        <path d="M5.25 7.25 12 3.75l6.75 3.5v9.5L12 20.25l-6.75-3.5v-9.5Z" />
        <path
          class="agent-icon__muted"
          d="M5.5 7.5 12 11l6.5-3.5M12 11v9M8.2 13.1l3.8 2.05 3.8-2.05"
        />
      </template>

      <template v-else-if="kind === 'developer'">
        <path d="m8.5 8.25-3.25 3.7 3.25 3.8M15.5 8.25l3.25 3.7-3.25 3.8" />
        <path
          class="agent-icon__muted"
          d="m13.4 5.75-2.8 12.5"
        />
        <path d="M12 3.75v2.1M12 18.15v2.1" />
      </template>

      <template v-else-if="kind === 'tester'">
        <circle
          cx="12"
          cy="12"
          r="7.25"
        />
        <circle
          class="agent-icon__muted"
          cx="12"
          cy="12"
          r="3.75"
        />
        <path d="m9.9 12.1 1.4 1.45 2.9-3.15" />
        <path
          class="agent-icon__muted"
          d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4"
        />
      </template>

      <template v-else-if="kind === 'writer'">
        <path d="M6.5 4.75h7.25L17.5 8.5v10.75H6.5V4.75Z" />
        <path
          class="agent-icon__muted"
          d="M13.5 4.9v3.85h3.85M9 11h5.5M9 14h4"
        />
        <path d="m14.5 17.4 3.35-3.35 1.1 1.1-3.35 3.35-1.6.5.5-1.6Z" />
      </template>

      <template v-else-if="kind === 'designer'">
        <path d="M12 4.25 19.75 12 12 19.75 4.25 12 12 4.25Z" />
        <path
          class="agent-icon__muted"
          d="M12 4.25V12h7.75M12 12v7.75M4.25 12H12"
        />
        <circle
          cx="12"
          cy="12"
          r="1.55"
        />
      </template>

      <template v-else-if="kind === 'reviewer'">
        <circle
          cx="10.8"
          cy="10.8"
          r="5.75"
        />
        <path d="m15.15 15.15 4.1 4.1" />
        <path
          class="agent-icon__muted"
          d="m8.45 10.85 1.5 1.45 3.05-3.45"
        />
      </template>

      <template v-else-if="kind === 'ops'">
        <path d="M6 5.25h12v4.5H6v-4.5ZM6 14.25h12v4.5H6v-4.5Z" />
        <path
          class="agent-icon__muted"
          d="M8.5 7.5h.1M8.5 16.5h.1M11 12h2M12 9.75v4.5"
        />
        <path d="M14.5 7.5h1.25M14.5 16.5h1.25" />
      </template>

      <template v-else>
        <path d="M12 4.25c4.6 0 7.75 3.15 7.75 7.75S16.6 19.75 12 19.75 4.25 16.6 4.25 12 7.4 4.25 12 4.25Z" />
        <path
          class="agent-icon__muted"
          d="M12 8.25v7.5M8.25 12h7.5"
        />
      </template>
    </g>
  </svg>
</template>

<style scoped src="./styles.css"></style>
