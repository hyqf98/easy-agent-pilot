<script setup lang="ts">
import {
  useEaConfirmDialog,
  type EaConfirmDialogEmits,
  type EaConfirmDialogProps
} from './useEaConfirmDialog'

const props = withDefaults(defineProps<EaConfirmDialogProps>(), {
  visible: false,
  type: 'warning',
  confirmButtonType: 'danger'
})
const emit = defineEmits<EaConfirmDialogEmits>()

const {
  t,
  iconMap,
  dialogRef,
  cancelButtonRef,
  dialogId,
  handleConfirm,
  handleCancel,
  handleOverlayClick,
  EaButton,
  EaIcon
} = useEaConfirmDialog(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="confirm-dialog-overlay"
      @click="handleOverlayClick"
    >
      <div
        ref="dialogRef"
        class="confirm-dialog"
        :class="`confirm-dialog--${type}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${dialogId}-title`"
      >
        <div class="confirm-dialog__header">
          <div class="confirm-dialog__icon-wrapper">
            <EaIcon
              :name="iconMap[type]"
              :size="24"
              class="confirm-dialog__icon"
              :class="`confirm-dialog__icon--${type}`"
            />
          </div>
          <h3
            :id="`${dialogId}-title`"
            class="confirm-dialog__title"
          >
            {{ title || t('common.confirm') }}
          </h3>
        </div>

        <div
          v-if="message"
          class="confirm-dialog__body"
        >
          <p class="confirm-dialog__message">
            {{ message }}
          </p>
        </div>

        <div class="confirm-dialog__actions">
          <EaButton
            ref="cancelButtonRef"
            type="secondary"
            @click="handleCancel"
          >
            {{ cancelLabel || t('common.cancel') }}
          </EaButton>
          <EaButton
            :type="confirmButtonType"
            @click="handleConfirm"
          >
            {{ confirmLabel || t('common.confirm') }}
          </EaButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>
