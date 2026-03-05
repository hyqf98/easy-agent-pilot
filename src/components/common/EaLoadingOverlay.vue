<script setup lang="ts">
/**
 * EaLoadingOverlay - 全局加载遮罩组件
 * 显示加载状态、进度条和取消按钮
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGlobalLoading } from '@/composables'
import EaButton from './EaButton.vue'
import EaIcon from './EaIcon.vue'

export interface EaLoadingOverlayProps {
  /** 自定义标题 */
  title?: string
  /** 自定义消息 */
  message?: string
  /** 进度 (0-100，-1 表示不确定进度) */
  progress?: number
  /** 是否可取消 */
  cancellable?: boolean
  /** 是否显示遮罩 */
  modelValue?: boolean
}

const props = withDefaults(defineProps<EaLoadingOverlayProps>(), {
  progress: -1,
  cancellable: false,
  modelValue: undefined
})

const emit = defineEmits<{
  cancel: []
  'update:modelValue': [value: boolean]
}>()

const { t } = useI18n()
const { globalLoading, cancel: cancelLoading } = useGlobalLoading()

// 计算是否显示
const visible = computed(() => {
  if (props.modelValue !== undefined) {
    return props.modelValue
  }
  return globalLoading.value.visible
})

// 计算标题
const displayTitle = computed(() => {
  if (props.title !== undefined) return props.title
  return globalLoading.value.title || t('common.loading')
})

// 计算消息
const displayMessage = computed(() => {
  if (props.message !== undefined) return props.message
  return globalLoading.value.message
})

// 计算进度
const displayProgress = computed(() => {
  if (props.progress !== undefined && props.progress >= 0) return props.progress
  return globalLoading.value.progress
})

// 是否显示进度条
const showProgress = computed(() => displayProgress.value >= 0)

// 是否显示进度百分比
const showPercentage = computed(() => displayProgress.value >= 0 && displayProgress.value <= 100)

// 是否可取消
const isCancellable = computed(() => {
  if (props.cancellable !== undefined) return props.cancellable
  return globalLoading.value.cancellable
})

// 进度条样式
const progressStyle = computed(() => ({
  width: `${Math.min(100, Math.max(0, displayProgress.value))}%`
}))

// 处理取消
function handleCancel() {
  if (props.modelValue !== undefined) {
    emit('cancel')
    emit('update:modelValue', false)
  } else {
    cancelLoading()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ea-loading-overlay">
      <div
        v-if="visible"
        class="ea-loading-overlay"
      >
        <div class="ea-loading-overlay__content">
          <!-- 加载图标 -->
          <div class="ea-loading-overlay__spinner">
            <svg
              viewBox="0 0 24 24"
              class="ea-loading-overlay__spinner-svg"
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

          <!-- 标题 -->
          <div
            v-if="displayTitle"
            class="ea-loading-overlay__title"
          >
            {{ displayTitle }}
          </div>

          <!-- 进度条 -->
          <div
            v-if="showProgress"
            class="ea-loading-overlay__progress"
          >
            <div class="ea-loading-overlay__progress-bar">
              <div
                class="ea-loading-overlay__progress-fill"
                :style="progressStyle"
              />
            </div>
            <span
              v-if="showPercentage"
              class="ea-loading-overlay__progress-text"
            >
              {{ Math.round(displayProgress) }}%
            </span>
          </div>

          <!-- 消息 -->
          <div
            v-if="displayMessage"
            class="ea-loading-overlay__message"
          >
            {{ displayMessage }}
          </div>

          <!-- 取消按钮 -->
          <div
            v-if="isCancellable"
            class="ea-loading-overlay__actions"
          >
            <EaButton
              type="secondary"
              size="small"
              @click="handleCancel"
            >
              <EaIcon
                name="x"
                :size="14"
              />
              {{ t('common.cancel') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ea-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal-backdrop, 1040);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-backdrop, rgba(0, 0, 0, 0.5));
  backdrop-filter: blur(2px);
}

.ea-loading-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-6);
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 200px;
  max-width: 360px;
}

.ea-loading-overlay__spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--color-primary);
}

.ea-loading-overlay__spinner-svg {
  width: 100%;
  height: 100%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ea-loading-overlay__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  text-align: center;
}

.ea-loading-overlay__progress {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  width: 100%;
}

.ea-loading-overlay__progress-bar {
  flex: 1;
  height: 6px;
  background-color: var(--color-surface-hover);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.ea-loading-overlay__progress-fill {
  height: 100%;
  background-color: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width var(--transition-normal) var(--easing-default);
}

.ea-loading-overlay__progress-text {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  min-width: 36px;
  text-align: right;
}

.ea-loading-overlay__message {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-align: center;
  word-break: break-word;
}

.ea-loading-overlay__actions {
  margin-top: var(--spacing-2);
}

/* 过渡动画 */
.ea-loading-overlay-enter-active,
.ea-loading-overlay-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.ea-loading-overlay-enter-active .ea-loading-overlay__content,
.ea-loading-overlay-leave-active .ea-loading-overlay__content {
  transition: transform var(--transition-normal) var(--easing-default);
}

.ea-loading-overlay-enter-from,
.ea-loading-overlay-leave-to {
  opacity: 0;
}

.ea-loading-overlay-enter-from .ea-loading-overlay__content,
.ea-loading-overlay-leave-to .ea-loading-overlay__content {
  transform: scale(0.95);
}
</style>
