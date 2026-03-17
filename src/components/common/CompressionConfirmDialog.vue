<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import { formatTokenCount } from '@/stores/token'
import type { TokenUsage } from '@/stores/token'
import type { CompressionStrategy } from '@/stores/token'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
  tokenUsage: TokenUsage
  messageCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [strategy: CompressionStrategy]
  cancel: []
}>()

// 选中的压缩策略
const selectedStrategy = ref<CompressionStrategy>('summary')

// 策略选项
const strategyOptions = computed(() => [
  {
    value: 'summary' as CompressionStrategy,
    label: t('compression.strategySummary'),
    description: t('compression.strategySummaryDesc'),
    icon: 'sparkles'
  },
  {
    value: 'simple' as CompressionStrategy,
    label: t('compression.strategySimple'),
    description: t('compression.strategySimpleDesc'),
    icon: 'trash'
  }
])

// Token 使用百分比
const usagePercentage = computed(() => props.tokenUsage.percentage.toFixed(1))

// 关闭对话框
const handleClose = () => {
  if (!props.loading) {
    emit('update:visible', false)
    emit('cancel')
  }
}

const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(handleClose)

// 确认压缩
const handleConfirm = () => {
  emit('confirm', selectedStrategy.value)
}
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

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: var(--spacing-4);
}

.modal-container {
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.modal-header__icon {
  color: var(--color-primary);
}

.modal-header__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.usage-info {
  display: flex;
  gap: var(--spacing-6);
  padding: var(--spacing-4) var(--spacing-5);
  background-color: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.usage-info__item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.usage-info__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.usage-info__value {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--color-text-primary);
}

.usage-info__value--highlight {
  color: var(--color-warning);
}

.usage-info__detail {
  font-weight: 400;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2);
  margin: var(--spacing-4) var(--spacing-5);
  padding: var(--spacing-3);
  background-color: var(--color-warning-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-warning-dark);
}

.warning-box__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-warning);
}

.strategy-section {
  padding: 0 var(--spacing-5);
  margin-bottom: var(--spacing-4);
}

.strategy-section__title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin: 0 0 var(--spacing-3);
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.strategy-option {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.strategy-option:hover {
  border-color: var(--color-primary-light);
  background-color: var(--color-bg-tertiary);
}

.strategy-option--selected {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.strategy-option__radio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border-strong);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  transition: all var(--transition-fast) var(--easing-default);
}

.strategy-option--selected .strategy-option__radio {
  border-color: var(--color-primary);
}

.strategy-option__radio-inner {
  width: 10px;
  height: 10px;
  background-color: var(--color-primary);
  border-radius: 50%;
}

.strategy-option__content {
  flex: 1;
  min-width: 0;
}

.strategy-option__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-1);
}

.strategy-option__label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

.strategy-option__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: 0;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--font-size-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  border: none;
  min-width: 80px;
}

.btn--secondary {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn--secondary:hover:not(:disabled) {
  background-color: var(--color-surface-hover);
}

.btn--primary {
  background-color: var(--color-primary);
  color: white;
}

.btn--primary:hover:not(:disabled) {
  background-color: var(--color-primary-dark);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn__loading {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 模态框动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>
