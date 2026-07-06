/**
 * useConversationComposerAttachments — ConversationComposerAttachments 组件的全部展示逻辑。
 *
 * 职责：
 * 1. 根据 main / 迷你面板两种布局，计算附件缩略图外壳的内联样式（尺寸、圆角、边框、阴影）；
 * 2. 暴露固定的图片媒体内联样式。
 *
 * 不含任何副作用或交互逻辑，仅为视图提供派生样式。
 */
import { computed } from 'vue'
import { EaIcon } from '@/components/common'
import AttachmentThumbnail from '@/components/common/AttachmentThumbnail/AttachmentThumbnail.vue'
import type { ConversationComposerViewState } from './useConversationComposer'

type Resolved<T> = T extends { value: infer V } ? V : T
type PendingAttachment = Resolved<ConversationComposerViewState['pendingImages']>[number]

/** 组件 Props */
export interface ConversationComposerAttachmentsProps {
  attachments: PendingAttachment[]
  main: boolean
  removeAttachment: (attachmentId: string) => void
}

/**
 * ConversationComposerAttachments 组件的 composable。
 * @param props 组件 props
 */
export function useConversationComposerAttachments(props: ConversationComposerAttachmentsProps) {
  const attachmentWrapperStyle = computed(() => {
    if (props.main) {
      return {
        width: '56px',
        height: '56px',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid var(--workspace-border, rgba(38, 38, 38, 0.1))',
        background: 'color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 92%, transparent)',
        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
      }
    }

    return {
      width: '68px',
      height: '68px',
      overflow: 'hidden',
      borderRadius: '14px',
      border: '1px solid color-mix(in srgb, var(--color-border) 72%, transparent)'
    }
  })

  const attachmentImageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  } as const

  return {
    // 子组件
    EaIcon,
    AttachmentThumbnail,
    // 派生样式
    attachmentWrapperStyle,
    attachmentImageStyle
  }
}
