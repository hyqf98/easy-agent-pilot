/**
 * useComposerAttachments — 附件（图片 / 文件）的上传、占位符、粘贴、删除与恢复。
 *
 * 职责说明：
 * - 上传：uploadAttachments / handleAttachmentFileChange / openAttachmentPicker。
 * - 粘贴：handlePaste。
 * - 占位符：insertAttachmentPlaceholders（向输入框插入 [Image1]/[File2] 等）。
 * - 删除/恢复：removeImage / restorePendingImages（删除时会重排后续编号）。
 * - 预览构建：buildAttachmentPreview / buildQueuedMessagePreview（队列消息预览文案）。
 * 通过 ctx 消费 sessionExecutionStore / inputText / textareaRef / renderLayerRef 等共享状态。
 */
import { invoke } from '@tauri-apps/api/core'
import type { MessageAttachment } from '@/stores/message'
import type { PendingImageAttachment } from '@/stores/sessionExecution'
import { resolveAttachmentPreviewUrl } from '@/utils/attachmentPreview'
import {
  buildTokenInsertPayload,
  syncTextareaCaret,
  composerDebug,
  type UploadImageInput,
  type UploadSessionImagesResponse
} from './composerHelpers'
import type { ComposerSharedContext } from './useComposerShared'

/** 队列消息草稿中需要被消费的最小切片（避免与 queued 模块循环依赖）。 */
export interface ComposerAttachmentsQueuedDeps {
  buildAttachmentPreview: (attachments: MessageAttachment[]) => string
}

export function useComposerAttachments(ctx: ComposerSharedContext) {
  const {
    t,
    currentSessionId,
    currentProjectPath,
    inputText,
    textareaRef,
    fileInputRef,
    renderLayerRef,
    pendingImages,
    sessionExecutionStore,
    notificationStore
  } = ctx

  const toPendingAttachment = async (attachment: MessageAttachment): Promise<PendingImageAttachment> => ({
    ...attachment,
    previewUrl: await resolveAttachmentPreviewUrl(attachment)
  })

  const buildAttachmentPreview = (attachments: MessageAttachment[]) => {
    if (attachments.length === 0) {
      return ''
    }

    if (attachments.length === 1) {
      return attachments[0].name.trim()
    }

    return t('message.queueAttachments', { count: attachments.length })
  }

  const uploadAttachments = async (files: File[]) => {
    const sessionId = currentSessionId.value
    if (!sessionId || files.length === 0) {
      return
    }

    try {
      sessionExecutionStore.setIsUploadingImages(sessionId, true)

      const payload: UploadImageInput[] = await Promise.all(files.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
      })))

      const result = await invoke<UploadSessionImagesResponse>('upload_session_images', {
        sessionId,
        projectPath: currentProjectPath.value,
        files: payload
      })

      const pendingImages = await Promise.all(result.attachments.map(toPendingAttachment))
      sessionExecutionStore.appendPendingImages(sessionId, pendingImages)

      const currentCount = sessionExecutionStore.getPendingImages(sessionId).length
      insertAttachmentPlaceholders(
        currentCount - pendingImages.length + 1,
        currentCount,
        payload.map(p => p.mimeType)
      )
    } catch (error) {
      console.error('Failed to upload attachments:', error)
      notificationStore.smartError('上传附件', error instanceof Error ? error : new Error(String(error)))
    } finally {
      sessionExecutionStore.setIsUploadingImages(sessionId, false)
    }
  }

  const insertAttachmentPlaceholders = (
    startIndex: number,
    endIndex: number,
    mimeTypes: string[]
  ) => {
    const textarea = textareaRef.value
    if (!textarea) return

    const cursorPos = textarea.selectionStart ?? inputText.value.length
    const before = inputText.value.slice(0, cursorPos)
    const after = inputText.value.slice(cursorPos)

    const placeholders: string[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      const mimeType = mimeTypes[i - startIndex] || ''
      const isImage = mimeType.startsWith('image/')
      placeholders.push(isImage ? `[Image${i}]` : `[File${i}]`)
    }

    const token = placeholders.join(' ')
    const { newText, newPosition } = buildTokenInsertPayload(before, token, after)
    composerDebug('attach-insert', { startIndex, endIndex, placeholders, newPosition })

    textarea.value = newText
    inputText.value = newText

    requestAnimationFrame(() => {
      syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
    })
  }

  const openAttachmentPicker = () => {
    fileInputRef.value?.click()
  }

  const handleAttachmentFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const files = target.files ? Array.from(target.files) : []
    target.value = ''
    await uploadAttachments(files)
  }

  const handlePaste = async (event: ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    await uploadAttachments(imageFiles)
  }

  const removeImage = async (imageId: string) => {
    const sessionId = currentSessionId.value
    const imagesBeforeRemove = pendingImages.value
    const imageIndex = imagesBeforeRemove.findIndex(item => item.id === imageId)
    const image = imageIndex >= 0 ? imagesBeforeRemove[imageIndex] : null
    if (!sessionId || !image) {
      return
    }

    const totalCount = imagesBeforeRemove.length
    const isImage = image.mimeType.startsWith('image/')
    const removedPlaceholder = isImage ? `[Image${imageIndex + 1}]` : `[File${imageIndex + 1}]`

    try {
      await invoke('delete_uploaded_image', {
        sessionId,
        path: image.path
      })

      let text = inputText.value

      text = text.replace(removedPlaceholder, '')

      for (let i = imageIndex + 2; i <= totalCount; i++) {
        const oldImageTag = `[Image${i}]`
        const oldFileTag = `[File${i}]`
        const newIndex = i - 1
        const newImageTag = `[Image${newIndex}]`
        const newFileTag = `[File${newIndex}]`
        text = text.split(oldImageTag).join(newImageTag)
        text = text.split(oldFileTag).join(newFileTag)
      }

      text = text.replace(/[ \t]{2,}/g, ' ').trim()

      sessionExecutionStore.removePendingImage(sessionId, imageId)

      if (textareaRef.value) {
        textareaRef.value.value = text
      }
      inputText.value = text

      composerDebug('remove-attachment', { imageId, removedPlaceholder, imageIndex, newTextLen: text.length })
    } catch (error) {
      console.error('Failed to delete uploaded attachment:', error)
      notificationStore.smartError('删除附件', error instanceof Error ? error : new Error(String(error)))
    }
  }

  const restorePendingImages = async (attachments: MessageAttachment[] = []) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    const pendingImages = await Promise.all(attachments.map(toPendingAttachment))
    sessionExecutionStore.setPendingImages(sessionId, pendingImages)
  }

  return {
    buildAttachmentPreview,
    uploadAttachments,
    insertAttachmentPlaceholders,
    openAttachmentPicker,
    handleAttachmentFileChange,
    handlePaste,
    removeImage,
    restorePendingImages
  }
}
