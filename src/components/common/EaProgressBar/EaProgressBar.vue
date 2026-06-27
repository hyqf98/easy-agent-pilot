<script setup lang="ts">
import { useEaProgressBar, type EaProgressBarProps } from './useEaProgressBar'

const props = withDefaults(defineProps<EaProgressBarProps>(), {
  value: -1,
  max: 100,
  showText: false,
  size: 'medium',
  variant: 'primary',
  striped: false,
  animated: false
})

const {
  percentage,
  isIndeterminate,
  progressStyle,
  containerClasses
} = useEaProgressBar(props)
</script>

<template>
  <div :class="containerClasses">
    <div class="ea-progress-bar__track">
      <div
        class="ea-progress-bar__fill"
        :style="progressStyle"
      />
    </div>
    <span
      v-if="showText && !isIndeterminate"
      class="ea-progress-bar__text"
    >
      {{ Math.round(percentage) }}%
    </span>
  </div>
</template>

<style scoped src="./styles.css"></style>
