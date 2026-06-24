<script setup lang="ts">
import { ref } from 'vue'
import { EaIcon } from '@/components/common'
import DynamicForm from '@/components/plan/dynamicForm/DynamicForm.vue'
import type { DynamicFormSchema } from '@/types/plan'

defineProps<{
  question: string
  formSchema: DynamicFormSchema
}>()

const emit = defineEmits<{
  (e: 'submit', values: Record<string, unknown>): void
  (e: 'cancel'): void
}>()

// 组件挂载即展示，配合父级 v-if 控制收起时的离场动画
const visible = ref(true)

function handleSubmit(values: Record<string, unknown>) {
  emit('submit', values)
}

function handleCancel() {
  visible.value = false
  emit('cancel')
}
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
        </div>
        <button
          type="button"
          class="active-form-popup__close"
          :title="'收起'"
          @click="handleCancel"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>

      <p
        v-if="question"
        class="active-form-popup__question"
      >
        {{ question }}
      </p>

      <div class="active-form-popup__body">
        <DynamicForm
          :schema="formSchema"
          :show-header="false"
          :show-submitted-state="false"
          variant="active"
          @submit="handleSubmit"
          @cancel="handleCancel"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.active-form-popup {
  position: relative;
  margin: 0 0 8px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--workspace-border, var(--color-border)));
  background: var(--workspace-panel-bg, var(--color-bg-primary));
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.active-form-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--workspace-control-bg, var(--color-bg-secondary)) 76%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-primary) 12%, var(--workspace-border, var(--color-border)));
}

.active-form-popup__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.active-form-popup__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.active-form-popup__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--workspace-text-primary, var(--color-text-primary));
  white-space: nowrap;
}

.active-form-popup__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.active-form-popup__close:hover {
  background: color-mix(in srgb, var(--color-border) 60%, transparent);
  color: var(--color-text-primary);
}

.active-form-popup__question {
  margin: 0;
  padding: 12px 14px 5px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.active-form-popup__body {
  padding: 5px 12px 10px;
}

/* 动态表单内部由 DynamicForm 自带滚动，这里解除容器查询高度限制 */
.active-form-popup__body :deep(.form-body) {
  max-height: min(42vh, 360px);
}

:global([data-theme='dark']) .active-form-popup,
:global(.dark) .active-form-popup {
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.34);
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
