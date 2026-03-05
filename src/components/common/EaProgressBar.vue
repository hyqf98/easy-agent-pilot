<script setup lang="ts">
/**
 * EaProgressBar - 进度条组件
 * 支持确定进度和不确定进度两种模式
 */
import { computed } from 'vue'

export interface EaProgressBarProps {
  /** 进度值 (0-100，-1 表示不确定进度) */
  value?: number
  /** 最大值 */
  max?: number
  /** 是否显示百分比文本 */
  showText?: boolean
  /** 尺寸 */
  size?: 'small' | 'medium' | 'large'
  /** 颜色主题 */
  variant?: 'primary' | 'success' | 'warning' | 'error'
  /** 是否带条纹动画 */
  striped?: boolean
  /** 是否动画（配合 striped 使用） */
  animated?: boolean
}

const props = withDefaults(defineProps<EaProgressBarProps>(), {
  value: -1,
  max: 100,
  showText: false,
  size: 'medium',
  variant: 'primary',
  striped: false,
  animated: false
})

// 计算百分比
const percentage = computed(() => {
  if (props.value < 0) return 0
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})

// 是否是不确定进度
const isIndeterminate = computed(() => props.value < 0)

// 进度条样式
const progressStyle = computed(() => ({
  width: isIndeterminate.value ? '100%' : `${percentage.value}%`
}))

// 容器类
const containerClasses = computed(() => [
  'ea-progress-bar',
  `ea-progress-bar--${props.size}`,
  `ea-progress-bar--${props.variant}`,
  {
    'ea-progress-bar--indeterminate': isIndeterminate.value,
    'ea-progress-bar--striped': props.striped,
    'ea-progress-bar--animated': props.animated
  }
])
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

<style scoped>
.ea-progress-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
}

.ea-progress-bar__track {
  flex: 1;
  background-color: var(--color-surface-hover);
  border-radius: var(--radius-full);
  overflow: hidden;
}

/* 尺寸 */
.ea-progress-bar--small .ea-progress-bar__track {
  height: 4px;
}

.ea-progress-bar--medium .ea-progress-bar__track {
  height: 6px;
}

.ea-progress-bar--large .ea-progress-bar__track {
  height: 8px;
}

.ea-progress-bar__fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-normal) var(--easing-default);
}

/* 颜色变体 */
.ea-progress-bar--primary .ea-progress-bar__fill {
  background-color: var(--color-primary);
}

.ea-progress-bar--success .ea-progress-bar__fill {
  background-color: var(--color-success);
}

.ea-progress-bar--warning .ea-progress-bar__fill {
  background-color: var(--color-warning);
}

.ea-progress-bar--error .ea-progress-bar__fill {
  background-color: var(--color-error);
}

/* 条纹 */
.ea-progress-bar--striped .ea-progress-bar__fill {
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.15) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.15) 75%,
    transparent 75%,
    transparent
  );
  background-size: 1rem 1rem;
}

/* 动画 */
.ea-progress-bar--animated.ea-progress-bar--striped .ea-progress-bar__fill {
  animation: progress-bar-stripes 1s linear infinite;
}

@keyframes progress-bar-stripes {
  from {
    background-position: 1rem 0;
  }
  to {
    background-position: 0 0;
  }
}

/* 不确定进度 */
.ea-progress-bar--indeterminate .ea-progress-bar__fill {
  position: relative;
  width: 30% !important;
  animation: progress-bar-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-bar-indeterminate {
  0% {
    left: -30%;
  }
  100% {
    left: 100%;
  }
}

.ea-progress-bar--indeterminate .ea-progress-bar__track {
  position: relative;
}

.ea-progress-bar__text {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  min-width: 36px;
  text-align: right;
}
</style>
