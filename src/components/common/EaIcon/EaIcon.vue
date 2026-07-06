<script setup lang="ts">
/** EaIcon 组件：通用图标渲染器，按名称解析并渲染对应图标（逻辑见 useEaIcon.ts） */
import { useEaIcon, type EaIconProps } from './useEaIcon'

const props = withDefaults(defineProps<EaIconProps>(), {
  size: 20,
  strokeWidth: 2,
  spin: false
})

const { iconComponent, iconStyle, parsedSize } = useEaIcon(props)
</script>

<template>
  <component
    :is="iconComponent"
    v-if="iconComponent"
    :size="parsedSize"
    :stroke-width="strokeWidth"
    :style="iconStyle"
    :class="['ea-icon', { 'ea-icon--spin': spin }]"
  />
  <span
    v-else
    class="ea-icon ea-icon--missing"
  >
    ?
  </span>
</template>

<style scoped src="./styles.css"></style>
