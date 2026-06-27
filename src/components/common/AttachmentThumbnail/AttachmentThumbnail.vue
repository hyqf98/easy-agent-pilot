<script setup lang="ts">
import { useAttachmentThumbnail, type AttachmentThumbnailProps } from './useAttachmentThumbnail'

const props = withDefaults(defineProps<AttachmentThumbnailProps>(), {
  wrapperClass: '',
  mediaClass: '',
  wrapperStyle: undefined,
  mediaStyle: undefined,
  previewMaxWidth: 360,
  previewMaxHeight: 420
})

const {
  resolvedPreviewUrl,
  attachmentKind,
  attachmentTitle,
  attachmentExtension,
  attachmentIconName,
  imageClassName,
  EaIcon,
  ImageHoverPreview
} = useAttachmentThumbnail(props)
</script>

<template>
  <ImageHoverPreview
    v-if="attachmentKind === 'image'"
    :src="resolvedPreviewUrl"
    :alt="attachmentTitle"
    :title="attachmentTitle"
    :wrapper-class="wrapperClass"
    :image-class="imageClassName"
    :wrapper-style="wrapperStyle"
    :image-style="mediaStyle"
    :preview-max-width="previewMaxWidth"
    :preview-max-height="previewMaxHeight"
  >
    <slot />
  </ImageHoverPreview>

  <div
    v-else
    class="attachment-thumbnail"
    :class="[wrapperClass, `attachment-thumbnail--${attachmentKind}`]"
    :style="wrapperStyle"
    tabindex="0"
    :title="attachmentTitle"
  >
    <video
      v-if="attachmentKind === 'video'"
      class="attachment-thumbnail__video"
      :class="mediaClass"
      :style="mediaStyle"
      :src="resolvedPreviewUrl"
      muted
      playsinline
      preload="metadata"
    />

    <div
      v-else
      class="attachment-thumbnail__generic"
      :class="mediaClass"
      :style="mediaStyle"
    >
      <EaIcon
        :name="attachmentIconName"
        :size="18"
      />
      <span class="attachment-thumbnail__ext">
        {{ attachmentExtension }}
      </span>
    </div>

    <div class="attachment-thumbnail__overlay">
      <div
        v-if="attachmentKind === 'video'"
        class="attachment-thumbnail__video-badge"
      >
        <EaIcon
          name="play"
          :size="12"
        />
        <span>{{ attachmentExtension }}</span>
      </div>
      <span class="attachment-thumbnail__name">{{ attachmentTitle }}</span>
    </div>

    <slot />
  </div>
</template>

<style scoped src="./styles.css"></style>
