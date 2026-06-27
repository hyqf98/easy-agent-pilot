<script setup lang="ts">
export interface EaSkeletonProps {
  width?: string
  height?: string
  variant?: 'text' | 'circle' | 'rect'
  animation?: 'pulse' | 'wave' | 'none'
  count?: number
}

withDefaults(defineProps<EaSkeletonProps>(), {
  width: '100%',
  height: '14px',
  variant: 'text',
  animation: 'pulse',
  count: 1
})
</script>

<template>
  <div class="ea-skeleton-wrapper">
    <div
      v-for="i in count"
      :key="i"
      :class="[
        'ea-skeleton',
        `ea-skeleton--${variant}`,
        `ea-skeleton--${animation}`
      ]"
      :style="{
        width: variant === 'circle' ? height : width,
        height
      }"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>
