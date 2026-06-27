<script setup lang="ts">
import { useEaModal, type EaModalEmits, type EaModalProps } from './useEaModal'

const props = defineProps<EaModalProps>()
const emit = defineEmits<EaModalEmits>()

const { handleOverlayPointerDown, handleOverlayClick } = useEaModal(props, emit)
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

<style scoped src="./styles.css"></style>
