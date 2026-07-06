<script setup lang="ts">
/** ImageHoverPreview 组件：图片悬浮预览，鼠标悬停时弹出放大图（逻辑见 useImageHoverPreview.ts） */
import { useImageHoverPreview, type ImageHoverPreviewProps } from './useImageHoverPreview'

const props = withDefaults(defineProps<ImageHoverPreviewProps>(), {
  title: '',
  wrapperClass: '',
  imageClass: '',
  wrapperStyle: undefined,
  imageStyle: undefined,
  previewMaxWidth: 360,
  previewMaxHeight: 420,
  disabled: false
})

const {
  triggerRef,
  previewRef,
  isPreviewVisible,
  previewStyle,
  displayTitle,
  showPreview,
  hidePreview
} = useImageHoverPreview(props)
</script>

<template>
  <div
    ref="triggerRef"
    class="image-hover-preview"
    :class="wrapperClass"
    :style="wrapperStyle"
    tabindex="0"
    @mouseenter="showPreview"
    @mouseleave="hidePreview"
    @focusin="showPreview"
    @focusout="hidePreview"
  >
    <img
      :src="src"
      :alt="alt"
      :title="displayTitle || undefined"
      class="image-hover-preview__image"
      :class="imageClass"
      :style="imageStyle"
    >
    <slot />
  </div>

  <Teleport to="body">
    <Transition name="image-hover-preview-fade">
      <div
        v-if="isPreviewVisible"
        ref="previewRef"
        class="image-hover-preview__panel"
        :style="previewStyle"
        @mouseenter="showPreview"
        @mouseleave="hidePreview"
      >
        <img
          :src="src"
          :alt="alt"
          class="image-hover-preview__panel-image"
        >
        <div
          v-if="displayTitle"
          class="image-hover-preview__panel-title"
        >
          {{ displayTitle }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>
