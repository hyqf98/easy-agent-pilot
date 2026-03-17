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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 1050);
  padding: var(--spacing-4);
}

.ea-modal {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 400px;
  max-width: 600px;
}

.ea-modal__header {
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.ea-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-5);
}

.ea-modal__footer {
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>
