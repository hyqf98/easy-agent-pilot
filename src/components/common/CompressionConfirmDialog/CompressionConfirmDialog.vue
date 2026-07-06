<script setup lang="ts">
/** CompressionConfirmDialog 组件：上下文压缩确认弹窗，展示用量并选择压缩策略（逻辑见 useCompressionConfirmDialog.ts） */
import {
  useCompressionConfirmDialog,
  type CompressionConfirmDialogEmits,
  type CompressionConfirmDialogProps
} from './useCompressionConfirmDialog'

const props = defineProps<CompressionConfirmDialogProps>()
const emit = defineEmits<CompressionConfirmDialogEmits>()

const {
  t,
  selectedStrategy,
  strategyOptions,
  usagePercentage,
  formatTokenCount,
  handleClose,
  handleOverlayPointerDown,
  handleOverlayClick,
  handleConfirm,
  EaIcon
} = useCompressionConfirmDialog(props, emit)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="modal-overlay"
        @pointerdown.capture="handleOverlayPointerDown"
        @click.self="handleOverlayClick"
      >
        <div class="modal-container">
          <!-- 标题 -->
          <div class="modal-header">
            <EaIcon
              name="archive"
              :size="20"
              class="modal-header__icon"
            />
            <h3 class="modal-header__title">
              {{ t('compression.confirmTitle') }}
            </h3>
          </div>

          <!-- 当前使用信息 -->
          <div class="usage-info">
            <div class="usage-info__item">
              <span class="usage-info__label">{{ t('compression.currentUsage') }}</span>
              <span class="usage-info__value usage-info__value--highlight">
                {{ usagePercentage }}%
                <span class="usage-info__detail">
                  ({{ formatTokenCount(tokenUsage.used) }} / {{ formatTokenCount(tokenUsage.limit) }})
                </span>
              </span>
            </div>
            <div class="usage-info__item">
              <span class="usage-info__label">{{ t('compression.messageCount') }}</span>
              <span class="usage-info__value">{{ messageCount }}</span>
            </div>
          </div>

          <!-- 警告提示 -->
          <div class="warning-box">
            <EaIcon
              name="alert-triangle"
              :size="16"
              class="warning-box__icon"
            />
            <span>{{ t('compression.confirmMessage') }}</span>
          </div>

          <!-- 策略选择 -->
          <div class="strategy-section">
            <h4 class="strategy-section__title">
              {{ t('compression.strategy') }}
            </h4>
            <div class="strategy-options">
              <div
                v-for="option in strategyOptions"
                :key="option.value"
                class="strategy-option"
                :class="{ 'strategy-option--selected': selectedStrategy === option.value }"
                @click="selectedStrategy = option.value"
              >
                <div class="strategy-option__radio">
                  <span
                    v-if="selectedStrategy === option.value"
                    class="strategy-option__radio-inner"
                  />
                </div>
                <div class="strategy-option__content">
                  <div class="strategy-option__header">
                    <EaIcon
                      :name="option.icon"
                      :size="16"
                    />
                    <span class="strategy-option__label">{{ option.label }}</span>
                  </div>
                  <p class="strategy-option__desc">
                    {{ option.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="modal-actions">
            <button
              class="btn btn--secondary"
              :disabled="loading"
              @click="handleClose"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              class="btn btn--primary"
              :disabled="loading"
              @click="handleConfirm"
            >
              <span
                v-if="loading"
                class="btn__loading"
              />
              {{ loading ? t('compression.processing') : t('common.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>
