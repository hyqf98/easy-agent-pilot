<script setup lang="ts">
import {
  useEaLoadingOverlay,
  type EaLoadingOverlayEmits,
  type EaLoadingOverlayProps
} from './useEaLoadingOverlay'

const props = withDefaults(defineProps<EaLoadingOverlayProps>(), {
  progress: -1,
  cancellable: false,
  modelValue: undefined
})
const emit = defineEmits<EaLoadingOverlayEmits>()

const {
  t,
  visible,
  displayTitle,
  displayMessage,
  displayProgress,
  showProgress,
  showPercentage,
  isCancellable,
  progressStyle,
  handleCancel,
  EaButton,
  EaIcon
} = useEaLoadingOverlay(props, emit)
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

<style scoped src="./styles.css"></style>
