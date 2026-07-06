<script setup lang="ts">
/** FileTreeRenameDialog 组件：文件/文件夹重命名对话框（逻辑见 useFileTreeRenameDialog.ts） */
import { EaButton, EaIcon, EaInput } from '@/components/common'
import {
  useFileTreeRenameDialog,
  type FileTreeRenameDialogEmits,
  type FileTreeRenameDialogProps
} from './useFileTreeRenameDialog'

const props = defineProps<FileTreeRenameDialogProps>()
const emit = defineEmits<FileTreeRenameDialogEmits>()

const {
  t,
  inputValue,
  inputRef,
  errorMessage,
  handleConfirm,
  handleCancel,
  handleKeydown
} = useFileTreeRenameDialog(props, emit)
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

<style scoped src="./styles.css"></style>
