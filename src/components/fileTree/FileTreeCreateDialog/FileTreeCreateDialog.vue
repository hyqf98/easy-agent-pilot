<script setup lang="ts">
import { EaButton, EaIcon, EaInput } from '@/components/common'
import {
  useFileTreeCreateDialog,
  type FileTreeCreateDialogEmits,
  type FileTreeCreateDialogProps
} from './useFileTreeCreateDialog'

const props = defineProps<FileTreeCreateDialogProps>()
const emit = defineEmits<FileTreeCreateDialogEmits>()

const {
  t,
  inputValue,
  inputRef,
  title,
  placeholder,
  errorMessage,
  handleConfirm,
  handleCancel
} = useFileTreeCreateDialog(props, emit)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="create-dialog-overlay"
        @click="handleCancel"
      >
        <div
          class="create-dialog"
          @click.stop
        >
          <div class="create-dialog__header">
            <EaIcon
              :name="entryType === 'directory' ? 'folder-plus' : 'file-plus'"
              :size="20"
              class="create-dialog__icon"
            />
            <h4 class="create-dialog__title">
              {{ title }}
            </h4>
          </div>

          <div class="create-dialog__content">
            <EaInput
              ref="inputRef"
              v-model="inputValue"
              :placeholder="placeholder"
              :error="errorMessage"
              autofocus
              @keydown.enter="handleConfirm"
              @keydown.esc="handleCancel"
            />
          </div>

          <div class="create-dialog__actions">
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
              {{ t('common.create') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>
