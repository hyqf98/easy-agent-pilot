<script setup lang="ts">
/** EaTag 组件：通用标签，按 variant/size/rounded 渲染样式（逻辑见 useEaTag.ts） */
import { useEaTag, type EaTagProps } from './useEaTag'

const props = withDefaults(defineProps<EaTagProps>(), {
  variant: 'default',
  size: 'md',
  rounded: false
})

const { tagClasses } = useEaTag(props)
</script>

<template>
  <span :class="tagClasses">
    <slot />
  </span>
</template>

<style scoped src="./styles.css"></style>
