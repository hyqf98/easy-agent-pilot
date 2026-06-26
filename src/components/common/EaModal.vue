<script setup lang="ts">
import { watch } from 'vue'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'

const props = defineProps<{
  visible: boolean
  contentClass?: string
  overlayClass?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

// 控制 body 滚动
watch(() => props.visible, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

function close() {
  emit('update:visible', false)
}

const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(close)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="ea-modal-overlay"
      :class="overlayClass"
      @pointerdown.capture="handleOverlayPointerDown"
      @click.self="handleOverlayClick"
    >
      <div
        class="ea-modal"
        :class="contentClass"
      >
        <div
          v-if="$slots.header"
          class="ea-modal__header"
        >
          <slot name="header" />
        </div>
        <div class="ea-modal__body">
          <slot />
        </div>
        <div
          v-if="$slots.footer"
          class="ea-modal__footer"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ea-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 1050);
  padding: var(--spacing-4);
}

.ea-modal {
  background: color-mix(in srgb, var(--workspace-panel-bg, #fff) 96%, transparent);
  border: 1px solid var(--workspace-border, rgba(38, 38, 38, 0.1));
  border-radius: var(--radius-xl, 16px);
  box-shadow: var(--workspace-card-shadow, 0 18px 40px rgba(24, 24, 22, 0.06));
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 400px;
  max-width: 600px;
}

.ea-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--workspace-border, var(--color-border));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.ea-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-5);
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.ea-modal__footer {
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--workspace-border, var(--color-border));
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>
