<script setup lang="ts">
import { useEaLoading, type EaLoadingProps } from './useEaLoading'

const props = withDefaults(defineProps<EaLoadingProps>(), {
  message: '',
  size: 'md'
})

const { loadingClasses } = useEaLoading(props)
</script>

<template>
  <div :class="loadingClasses">
    <div class="ea-loading__spinner">
      <svg
        viewBox="0 0 24 24"
        class="ea-loading__spinner-svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="2.5"
          fill="none"
          stroke-dasharray="31.416"
          stroke-dashoffset="10"
        />
      </svg>
    </div>
    <p
      v-if="message"
      class="ea-loading__message"
    >
      {{ message }}
    </p>
  </div>
</template>

<style scoped src="./styles.css"></style>
