<script setup lang="ts">
/** PermissionPromptPopup 组件：工具调用权限请求弹层，展示工具与选项供用户授权（逻辑见 usePermissionPromptPopup.ts） */
import type { PermissionPromptPopupProps, PermissionPromptPopupEmits } from './usePermissionPromptPopup'
import { usePermissionPromptPopup } from './usePermissionPromptPopup'

const props = defineProps<PermissionPromptPopupProps>()
const emit = defineEmits<PermissionPromptPopupEmits>()

const {
  EaIcon,
  t,
  pending,
  submitting,
  inputSummary,
  resolveVariant,
  resolveOptionLabel,
  handleRespond
} = usePermissionPromptPopup(props, emit)
</script>

<template>
  <Transition name="active-form-popup">
    <div
      v-if="pending"
      class="permission-popup"
    >
      <div class="permission-popup__header">
        <div class="permission-popup__title">
          <EaIcon
            name="shield-check"
            :size="14"
            class="permission-popup__icon"
          />
          <span class="permission-popup__label">{{ t('permission.title') }}</span>
        </div>
      </div>

      <div class="permission-popup__body">
        <div class="permission-popup__tool">
          <span class="permission-popup__tool-name">{{ pending.toolName || t('permission.unknownTool') }}</span>
          <p
            v-if="inputSummary"
            class="permission-popup__tool-input"
          >
            {{ inputSummary }}
          </p>
        </div>

        <div class="permission-popup__actions">
          <button
            v-for="option in pending.options"
            :key="option.optionId"
            type="button"
            class="permission-popup__btn"
            :class="`permission-popup__btn--${resolveVariant(option)}`"
            :disabled="submitting !== null"
            @click="handleRespond(option)"
          >
            {{ resolveOptionLabel(option) }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.permission-popup {
  position: relative;
  margin: 0 0 8px;
  border-radius: 14px;
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-panel-bg, var(--color-bg-primary));
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.permission-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 2px;
}

.permission-popup__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.permission-popup__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.permission-popup__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.permission-popup__body {
  padding: 8px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.permission-popup__tool-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.permission-popup__tool-input {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  word-break: break-all;
}

.permission-popup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.permission-popup__btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-control-bg, var(--color-bg-secondary));
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.permission-popup__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--workspace-control-bg, var(--color-bg-secondary)));
}

.permission-popup__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.permission-popup__btn--reject {
  color: var(--color-danger, #ef4444);
  border-color: color-mix(in srgb, var(--color-danger, #ef4444) 30%, var(--workspace-border, var(--color-border)));
}

.permission-popup__btn--allow-once,
.permission-popup__btn--allow-always {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 30%, var(--workspace-border, var(--color-border)));
}

.active-form-popup-enter-active,
.active-form-popup-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.active-form-popup-enter-from,
.active-form-popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
