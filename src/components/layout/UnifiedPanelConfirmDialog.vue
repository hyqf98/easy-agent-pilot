<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'

interface Props {
  visible: boolean
  title: string
  message: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  cancel: []
  confirm: []
}>()

const { t } = useI18n()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

function handleClose() {
  emit('update:visible', false)
  emit('cancel')
}
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

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.confirm-dialog {
  width: 400px;
  max-width: 90vw;
  background: color-mix(in srgb, var(--workspace-panel-bg, var(--color-surface)) 96%, transparent);
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: 16px;
  box-shadow: var(--workspace-card-shadow, 0 18px 40px rgba(24, 24, 22, 0.12));
}

.confirm-dialog__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-6);
  text-align: center;
}

.confirm-dialog__icon {
  margin-bottom: var(--spacing-4);
  color: var(--color-warning);
}

.confirm-dialog__title {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.confirm-dialog__message {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  white-space: pre-line;
  color: var(--workspace-text-secondary, var(--color-text-secondary));
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--workspace-border, var(--color-border));
}

</style>
