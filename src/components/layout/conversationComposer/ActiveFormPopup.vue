<script setup lang="ts">
/** ActiveFormPopup 组件：AI 主动询问的表单弹层，按字段步骤收集用户输入（逻辑见 useActiveFormPopup.ts） */
import type { ActiveFormPopupProps, ActiveFormPopupEmits } from './useActiveFormPopup'
import { useActiveFormPopup } from './useActiveFormPopup'

const props = defineProps<ActiveFormPopupProps>()
const emit = defineEmits<ActiveFormPopupEmits>()

const {
  EaIcon,
  DynamicForm,
  visible,
  isSingleField,
  currentStep,
  formValues,
  currentField,
  stepIndicator,
  canSubmitNow,
  getFieldComponent,
  updateFieldValue,
  getFieldError,
  goPrev,
  goNext,
  handleSubmit,
  handleSingleSubmit,
  handleCancel
} = useActiveFormPopup(props, emit)
</script>

<template>
  <Transition name="active-form-popup">
    <div
      v-if="visible"
      class="active-form-popup"
    >
      <div class="active-form-popup__header">
        <div class="active-form-popup__title">
          <EaIcon
            name="sparkles"
            :size="14"
            class="active-form-popup__icon"
          />
          <span class="active-form-popup__label">AI 需要你的输入</span>
          <span
            v-if="!isSingleField"
            class="active-form-popup__step"
          >{{ stepIndicator }}</span>
        </div>
        <div class="active-form-popup__header-actions">
          <button
            v-if="!isSingleField"
            type="button"
            class="active-form-popup__nav"
            :disabled="currentStep === 0"
            title="上一个"
            @click="goPrev"
          >
            <EaIcon
              name="chevron-left"
              :size="14"
            />
          </button>
          <button
            v-if="!isSingleField"
            type="button"
            class="active-form-popup__nav"
            :disabled="canSubmitNow"
            title="下一个"
            @click="goNext"
          >
            <EaIcon
              name="chevron-right"
              :size="14"
            />
          </button>
          <button
            type="button"
            class="active-form-popup__close"
            title="收起"
            @click="handleCancel"
          >
            <EaIcon
              name="x"
              :size="12"
            />
          </button>
        </div>
      </div>

      <p
        v-if="question"
        class="active-form-popup__question"
      >
        {{ question }}
      </p>

      <!-- 单字段：直接复用 DynamicForm 原生渲染（保留其交互细节） -->
      <div
        v-if="isSingleField"
        class="active-form-popup__body"
      >
        <DynamicForm
          :schema="formSchema"
          :show-header="false"
          :show-submitted-state="false"
          variant="active"
          @submit="handleSingleSubmit"
          @cancel="handleCancel"
        />
      </div>

      <!-- 多字段：分步逐个渲染当前字段 -->
      <div
        v-else
        class="active-form-popup__body"
      >
        <template v-if="currentField">
          <component
            :is="getFieldComponent(currentField.type)"
            :field="currentField"
            :model-value="formValues[currentField.name]"
            :error="getFieldError(currentField.name)"
            @update:model-value="updateFieldValue(currentField.name, $event)"
          />
        </template>

        <div class="active-form-popup__footer">
          <button
            type="button"
            class="active-form-popup__btn active-form-popup__btn--secondary"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            v-if="!canSubmitNow"
            type="button"
            class="active-form-popup__btn active-form-popup__btn--primary"
            @click="goNext"
          >
            下一步
          </button>
          <button
            v-else
            type="button"
            class="active-form-popup__btn active-form-popup__btn--primary"
            @click="handleSubmit"
          >
            提交
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.active-form-popup {
  position: relative;
  margin: 0 0 6px;
  border-radius: 10px;
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-panel-bg, var(--color-bg-primary));
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.active-form-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px 0;
}

.active-form-popup__title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.active-form-popup__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.active-form-popup__label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.active-form-popup__step {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--color-text-tertiary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
}

.active-form-popup__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.active-form-popup__nav,
.active-form-popup__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.active-form-popup__nav:hover:not(:disabled),
.active-form-popup__close:hover {
  background: color-mix(in srgb, var(--color-border) 60%, transparent);
  color: var(--color-text-primary);
}

.active-form-popup__nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.active-form-popup__question {
  margin: 0;
  padding: 2px 10px 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--color-text-primary);
}

.active-form-popup__body {
  padding: 6px 10px 8px;
}

/* 单字段模式：让内部 DynamicForm 完全融入，消除嵌套边框/背景 */
.active-form-popup__body :deep(.dynamic-form) {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  container-type: normal;
  padding: 0;
}

/* 动态表单内部由 DynamicForm 自带滚动，这里收紧高度限制 */
.active-form-popup__body :deep(.form-body) {
  max-height: min(36vh, 280px);
  gap: 6px;
}

/* 收紧 DynamicForm 自带的 footer（单字段时使用） */
.active-form-popup__body :deep(.form-footer) {
  margin-top: 6px;
  gap: 6px;
}

.active-form-popup__body :deep(.form-footer .btn) {
  padding: 4px 12px;
  font-size: 11.5px;
  min-width: 48px;
}

/* 分步模式底部操作区 */
.active-form-popup__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.active-form-popup__btn {
  padding: 4px 12px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.16s ease;
  min-width: 48px;
}

.active-form-popup__btn--primary {
  background: var(--workspace-text-primary, var(--color-text-primary));
  color: var(--workspace-panel-bg, #fff);
  border: 1px solid var(--workspace-text-primary, var(--color-text-primary));
}

.active-form-popup__btn--primary:hover {
  opacity: 0.9;
}

.active-form-popup__btn--secondary {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--workspace-border, var(--color-border));
}

.active-form-popup__btn--secondary:hover {
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
  color: var(--color-text-primary);
}

:global([data-theme='dark']) .active-form-popup,
:global(.dark) .active-form-popup {
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.3);
}

/* 进出动画 */
.active-form-popup-enter-active,
.active-form-popup-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.active-form-popup-enter-from,
.active-form-popup-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
