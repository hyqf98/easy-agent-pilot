<script setup lang="ts">
/**
 * 文件树重命名对话框组件
 */

import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon, EaButton, EaInput } from '@/components/common'
import type { FileTreeNodeData } from './types'

const { t } = useI18n()

interface Props {
  visible: boolean
  node: FileTreeNodeData | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [oldPath: string, newName: string]
  cancel: []
}>()

/// 输入值
const inputValue = ref('')

/// 输入框引用
const inputRef = ref<{ focus: () => void; select: () => void } | null>(null)

/// 错误信息
const errorMessage = computed(() => {
  if (!inputValue.value.trim()) {
    return t('validation.nameRequired')
  }
  if (inputValue.value.trim() === props.node?.label) {
    return t('validation.nameUnchanged')
  }
  return null
})

/// 监听可见性变化，自动聚焦
watch(() => props.visible, async (visible) => {
  if (visible && props.node) {
    inputValue.value = props.node.label
    await nextTick()
    // 聚焦并选中文本
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.select()
    }
  }
})

/// 处理确认
const handleConfirm = () => {
  if (errorMessage.value || !props.node) return

  emit('confirm', props.node.key, inputValue.value.trim())
  handleClose()
}

/// 处理取消
const handleCancel = () => {
  emit('cancel')
  handleClose()
}

/// 关闭对话框
const handleClose = () => {
  inputValue.value = ''
  emit('update:visible', false)
}

/// 处理键盘事件
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleConfirm()
  } else if (e.key === 'Escape') {
    handleCancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="rename-dialog-overlay"
        @click="handleCancel"
      >
        <div
          class="rename-dialog"
          @click.stop
          @keydown="handleKeydown"
        >
          <div class="rename-dialog__header">
            <EaIcon
              :name="node?.nodeType === 'directory' ? 'folder-edit' : 'file-edit'"
              :size="20"
              class="rename-dialog__icon"
            />
            <h4 class="rename-dialog__title">
              {{ node?.nodeType === 'directory' ? t('fileTree.renameFolder') : t('fileTree.renameFile') }}
            </h4>
          </div>

          <div class="rename-dialog__content">
            <EaInput
              ref="inputRef"
              v-model="inputValue"
              :placeholder="t('common.enterName')"
              :error="errorMessage"
              autofocus
              @keydown.enter="handleConfirm"
              @keydown.esc="handleCancel"
            />
          </div>

          <div class="rename-dialog__actions">
            <EaButton
              type="secondary"
              @click="handleCancel"
            >
              {{ t('common.cancel') }}
            </EaButton>
            <EaButton
              type="primary"
              :disabled="!!errorMessage"
              @click="handleConfirm"
            >
              {{ t('common.confirm') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rename-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.rename-dialog {
  width: 360px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.rename-dialog__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.rename-dialog__icon {
  color: var(--color-primary);
}

.rename-dialog__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.rename-dialog__content {
  padding: var(--spacing-5);
}

.rename-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-active .rename-dialog,
.modal-leave-active .rename-dialog {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .rename-dialog,
.modal-leave-to .rename-dialog {
  transform: scale(0.95);
  opacity: 0;
}
</style>
