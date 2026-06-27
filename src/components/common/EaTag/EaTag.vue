<script setup lang="ts">
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
