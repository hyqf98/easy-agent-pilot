<script setup lang="ts">
import {
  useUnifiedPanelConfirmDialog,
  type UnifiedPanelConfirmDialogEmits,
  type UnifiedPanelConfirmDialogProps
} from './useUnifiedPanelConfirmDialog'

const props = defineProps<UnifiedPanelConfirmDialogProps>()
const emit = defineEmits<UnifiedPanelConfirmDialogEmits>()

const { t, dialogVisible, handleClose, EaButton, EaIcon } = useUnifiedPanelConfirmDialog(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dialogVisible"
      class="modal-overlay"
      @click="handleClose"
    >
      <div
        class="confirm-dialog"
        @click.stop
      >
        <div class="confirm-dialog__content">
          <EaIcon
            name="alert-triangle"
            :size="24"
            class="confirm-dialog__icon"
          />
          <h4 class="confirm-dialog__title">
            {{ title }}
          </h4>
          <p class="confirm-dialog__message">
            {{ message }}
          </p>
        </div>
        <div class="confirm-dialog__actions">
          <EaButton
            type="secondary"
            @click="handleClose"
          >
            {{ t('common.cancel') }}
          </EaButton>
          <EaButton
            type="primary"
            @click="emit('confirm')"
          >
            {{ t('common.confirmDelete') }}
          </EaButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>
