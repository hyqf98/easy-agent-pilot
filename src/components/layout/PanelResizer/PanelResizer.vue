<script setup lang="ts">
import { usePanelResizer, type PanelResizerEmits, type PanelResizerProps } from './usePanelResizer'

const props = withDefaults(defineProps<PanelResizerProps>(), {
  direction: 'right',
  minWidth: 100,
  maxWidth: 400,
  disabled: false,
  currentWidth: 0
})
const emit = defineEmits<PanelResizerEmits>()

const { isDragging, handleMouseDown } = usePanelResizer(props, emit)
</script>

<template>
  <div
    v-if="!disabled"
    :class="['panel-resizer', { 'panel-resizer--dragging': isDragging }]"
    @mousedown="handleMouseDown"
  >
    <div class="panel-resizer__line" />
  </div>
</template>

<style scoped src="./styles.css"></style>
