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

<style scoped>
.ea-skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.ea-skeleton {
  display: block;
  background-color: var(--color-surface-hover);
}

.ea-skeleton--text {
  border-radius: var(--radius-sm);
}

.ea-skeleton--circle {
  border-radius: var(--radius-full);
}

.ea-skeleton--rect {
  border-radius: var(--radius-md);
}

.ea-skeleton--pulse {
  animation: ea-skeleton-pulse 1.5s ease-in-out 0.5s infinite;
}

.ea-skeleton--wave {
  background: linear-gradient(
    90deg,
    var(--color-surface-hover) 25%,
    var(--color-surface-active) 50%,
    var(--color-surface-hover) 75%
  );
  background-size: 200% 100%;
  animation: ea-skeleton-wave 1.5s ease-in-out infinite;
}

.ea-skeleton--none {
  animation: none;
}

@keyframes ea-skeleton-pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
  100% {
    opacity: 1;
  }
}

@keyframes ea-skeleton-wave {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
