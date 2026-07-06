/** useAttachmentThumbnail — AttachmentThumbnail 组件的 composable，负责消息附件缩略图（图标/图片预览）的展示状态与样式派生。 */
import { computed, ref, watch } from 'vue'
import type { StyleValue } from 'vue'
import type { MessageAttachment } from '@/stores/message'
import { getAttachmentPreviewUrl, resolveAttachmentPreviewUrl } from '@/utils/attachmentPreview'
import {
  getAttachmentExtension,
  getAttachmentIconName,
  getAttachmentKind,
  type AttachmentKind
} from '@/utils/attachmentMeta'
import EaIcon from '../EaIcon/EaIcon.vue'
import ImageHoverPreview from '../ImageHoverPreview/ImageHoverPreview.vue'

export interface AttachmentThumbnailProps {
  attachment: MessageAttachment
  wrapperClass?: string
  mediaClass?: string
  wrapperStyle?: StyleValue
  mediaStyle?: StyleValue
  previewMaxWidth?: number
  previewMaxHeight?: number
}

export function useAttachmentThumbnail(props: AttachmentThumbnailProps) {
  const resolvedPreviewUrl = ref(getAttachmentPreviewUrl(props.attachment))

  const attachmentKind = computed<AttachmentKind>(() => getAttachmentKind(props.attachment))
  const attachmentTitle = computed(() => props.attachment.name.trim() || props.attachment.path.trim())
  const attachmentExtension = computed(() => getAttachmentExtension(props.attachment))
  const attachmentIconName = computed(() => getAttachmentIconName(props.attachment))
  const imageClassName = computed(() => ['attachment-thumbnail__image', props.mediaClass].filter(Boolean).join(' '))

  watch(
    () => `${props.attachment.id}:${props.attachment.path}:${props.attachment.mimeType}:${props.attachment.previewUrl ?? ''}`,
    async () => {
      resolvedPreviewUrl.value = getAttachmentPreviewUrl(props.attachment)

      if (attachmentKind.value !== 'image') {
        return
      }

      resolvedPreviewUrl.value = await resolveAttachmentPreviewUrl(props.attachment)
    },
    { immediate: true }
  )

  return {
    resolvedPreviewUrl,
    attachmentKind,
    attachmentTitle,
    attachmentExtension,
    attachmentIconName,
    imageClassName,
    EaIcon,
    ImageHoverPreview
  }
}
