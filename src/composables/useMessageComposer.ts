import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { inferAgentProvider, useAgentStore } from '@/stores/agent'
import { useMessageStore, type MessageAttachment } from '@/stores/message'
import { useNotificationStore } from '@/stores/notification'
import { useProjectStore } from '@/stores/project'
import {
  useSessionExecutionStore,
  type PendingImageAttachment,
  type QueuedMessageDraft
} from '@/stores/sessionExecution'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useTokenStore, type CompressionStrategy, type TokenLevel } from '@/stores/token'
import { compressionService } from '@/services/compression'
import { conversationService } from '@/services/conversation'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import { FILE_MENTION_PATTERN, getMentionDisplayText, getMentionTitle } from '@/utils/fileMention'
import { resolveSessionAgent, resolveSessionAgentId } from '@/utils/sessionAgent'
import { resolveAttachmentPreviewUrl } from '@/utils/attachmentPreview'

interface TextSegment {
  type: 'text' | 'file'
  content: string
  displayContent?: string
  fullPath?: string
  titleContent?: string
}

interface UploadImageInput {
  fileName?: string
  mimeType: string
  bytes: number[]
}

interface UploadSessionImagesResponse {
  attachments: MessageAttachment[]
}

function sanitizeComposerText(value: string): string {
  let sanitized = ''

  for (const char of value) {
    const code = char.charCodeAt(0)
    const isControlChar = (code >= 0x00 && code <= 0x08)
      || code === 0x0B
      || code === 0x0C
      || (code >= 0x0E && code <= 0x1F)
      || code === 0x7F

    if (!isControlChar) {
      sanitized += char
    }
  }

  return sanitized
}

export function useMessageComposer() {
  const { t } = useI18n()
  const messageStore = useMessageStore()
  const sessionStore = useSessionStore()
  const settingsStore = useSettingsStore()
  const notificationStore = useNotificationStore()
  const projectStore = useProjectStore()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const tokenStore = useTokenStore()

  const showCompressionDialog = ref(false)
  const isCompressing = ref(false)
  const isAgentDropdownOpen = ref(false)
  const agentDropdownRef = ref<HTMLElement | null>(null)
  const isModelDropdownOpen = ref(false)
  const modelDropdownRef = ref<HTMLElement | null>(null)
  const selectedModelId = ref<string>('')
  const textareaRef = ref<HTMLTextAreaElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const renderLayerRef = ref<HTMLDivElement | null>(null)
  const showFileMention = ref(false)
  const fileMentionPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const mentionStart = ref(-1)
  const mentionSearchText = ref('')

  const agentOptions = computed(() =>
    agentStore.agents.map(agent => ({
      label: agent.name,
      value: agent.id,
      modelId: agent.modelId,
      provider: agent.provider,
      type: agent.type,
      isCustom: agent.customModelEnabled || false
    }))
  )

  const currentSessionId = computed(() => sessionStore.currentSessionId)

  const currentAgentId = computed(() => {
    return resolveSessionAgentId(sessionStore.currentSession, agentStore.agents)
  })

  const currentAgent = computed(() => {
    return resolveSessionAgent(sessionStore.currentSession, agentStore.agents)
  })

  const currentProject = computed(() => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return null
    return projectStore.projects.find(project => project.id === sessionStore.currentSession?.projectId) || null
  })

  const currentAgentName = computed(() => {
    if (!currentAgent.value) {
      return t('settings.agentConfig.selectAgent')
    }
    return currentAgent.value.name
  })

  const modelOptions = computed(() => {
    const agentId = currentAgentId.value
    if (!agentId) return []

    return agentConfigStore.getModelsConfigs(agentId)
      .filter(config => config.enabled)
      .map(config => ({
        value: config.modelId,
        label: config.displayName,
        isDefault: config.isDefault
      }))
  })

  const presetModelOptions = computed(() => modelOptions.value)

  const inputText = computed({
    get: () => currentSessionId.value ? sessionExecutionStore.getInputText(currentSessionId.value) : '',
    set: (value) => {
      if (currentSessionId.value) {
        sessionExecutionStore.setInputText(currentSessionId.value, value)
      }
    }
  })

  const isSending = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getIsBusy(currentSessionId.value) : false
  )

  const pendingImages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getPendingImages(currentSessionId.value) : []
  )

  const queuedMessages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getQueuedMessages(currentSessionId.value) : []
  )

  const isUploadingImages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getIsUploadingImages(currentSessionId.value) : false
  )

  const parsedInputText = computed<TextSegment[]>(() => {
    const text = inputText.value
    if (!text) return []

    const segments: TextSegment[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    FILE_MENTION_PATTERN.lastIndex = 0

    while ((match = FILE_MENTION_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const content = text.slice(lastIndex, match.index)
        if (content) {
          segments.push({
            type: 'text',
            content
          })
        }
      }

      const fullPath = match[1] ?? match[2]

      segments.push({
        type: 'file',
        content: match[0],
        displayContent: getMentionDisplayText(match[0], fullPath),
        fullPath,
        titleContent: getMentionTitle(fullPath)
      })

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      const content = text.slice(lastIndex)
      if (content) {
        segments.push({
          type: 'text',
          content
        })
      }
    }

    return segments
  })

  const tokenUsage = computed(() => {
    if (!currentSessionId.value) {
      return { used: 0, limit: 0, percentage: 0, level: 'safe' as TokenLevel }
    }
    return tokenStore.getTokenUsage(currentSessionId.value)
  })

  const messageCount = computed(() => {
    if (!currentSessionId.value) return 0
    return messageStore.messagesBySession(currentSessionId.value).length
  })

  const shouldShowCompressButton = computed(() => {
    return tokenUsage.value.percentage >= 50 && messageCount.value > 0
  })

  const inputPlaceholder = computed(() => {
    const shortcut = settingsStore.settings.sendOnEnter
      ? t('message.shortcutEnter')
      : t('message.shortcutModifierEnter')
    return t('message.inputPlaceholder', { shortcut })
  })

  watch(currentAgentId, async (agentId) => {
    if (agentId) {
      const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === agentId))
      await agentConfigStore.ensureModelsConfigs(agentId, provider)
    }
  }, { immediate: true })

  watch(currentAgent, async (agent) => {
    if (agent && currentAgentId.value) {
      await agentConfigStore.ensureModelsConfigs(currentAgentId.value, inferAgentProvider(agent))
      const configs = agentConfigStore.getModelsConfigs(currentAgentId.value)
      const defaultModel = configs.find(config => config.isDefault && config.enabled)
      selectedModelId.value = defaultModel?.modelId || ''
    } else {
      selectedModelId.value = ''
    }
  }, { immediate: true })

  watch(() => sessionStore.currentSessionId, async (sessionId) => {
    if (sessionId) {
      await nextTick()
      textareaRef.value?.focus()
    }
  }, { immediate: true })

  watch(inputText, (value) => {
    const sanitizedValue = sanitizeComposerText(value)
    if (sanitizedValue !== value) {
      inputText.value = sanitizedValue
    }
  })

  onMounted(async () => {
    try {
      await agentStore.loadAgents()
      if (currentAgentId.value) {
        const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === currentAgentId.value))
        await agentConfigStore.ensureModelsConfigs(currentAgentId.value, provider)
      }
    } catch (error) {
      console.error('Failed to load agents:', error)
    }
  })

  useSafeOutsideClick(
    () => [agentDropdownRef.value, modelDropdownRef.value],
    () => {
      isAgentDropdownOpen.value = false
      isModelDropdownOpen.value = false
    }
  )

  const syncScroll = () => {
    if (textareaRef.value && renderLayerRef.value) {
      renderLayerRef.value.scrollTop = textareaRef.value.scrollTop
    }
  }

  const toggleAgentDropdown = () => {
    isAgentDropdownOpen.value = !isAgentDropdownOpen.value
    if (isAgentDropdownOpen.value) {
      isModelDropdownOpen.value = false
    }
  }

  const selectAgent = async (agentId: string) => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) {
      isAgentDropdownOpen.value = false
      return
    }

    try {
      const agent = agentStore.agents.find(item => item.id === agentId)
      await sessionStore.updateSession(sessionId, {
        agentId,
        agentType: agent?.provider || agent?.type || 'claude',
        cliSessionId: '',
        cliSessionProvider: ''
      })
      selectedModelId.value = agent?.modelId || ''
      isAgentDropdownOpen.value = false
    } catch (error) {
      console.error('Failed to update session agent:', error)
    }
  }

  const toggleModelDropdown = () => {
    isModelDropdownOpen.value = !isModelDropdownOpen.value
    if (isModelDropdownOpen.value) {
      isAgentDropdownOpen.value = false
    }
  }

  const selectModel = async (modelId: string) => {
    if (!currentAgent.value || !currentAgentId.value) return

    selectedModelId.value = modelId
    isModelDropdownOpen.value = false

    try {
      const configs = agentConfigStore.getModelsConfigs(currentAgentId.value)
      const selectedConfig = configs.find(config => config.modelId === modelId)
      if (selectedConfig) {
        await agentConfigStore.updateModelConfig(selectedConfig.id, currentAgentId.value, {
          isDefault: true
        })
      }
    } catch (error) {
      console.error('Failed to update agent model:', error)
    }
  }

  const getModelLabel = (modelId: string) => {
    const model = modelOptions.value.find(item => item.value === modelId)
    return model ? model.label : modelId || '使用默认模型'
  }

  const handleOpenCompress = () => {
    showCompressionDialog.value = true
  }

  const handleConfirmCompress = async (strategy: CompressionStrategy) => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    const session = sessionStore.currentSession
    const agentId = resolveSessionAgentId(session, agentStore.agents) || currentAgent.value?.id

    if (!agentId) {
      notificationStore.smartError('压缩会话', new Error('无法获取智能体信息'))
      showCompressionDialog.value = false
      return
    }

    showCompressionDialog.value = false
    isCompressing.value = true

    try {
      const result = await compressionService.compressSession(
        sessionId,
        agentId,
        {
          strategy,
          triggerSource: 'manual'
        }
      )

      if (result.success) {
        notificationStore.success(t('compression.success'))
        await conversationService.drainQueue(sessionId)
      } else {
        notificationStore.error(t('compression.failed'), result.error)
      }
    } catch (error) {
      notificationStore.smartError('压缩失败', error instanceof Error ? error : new Error(String(error)))
    } finally {
      isCompressing.value = false
      showCompressionDialog.value = false
    }
  }

  const handleCancelCompress = () => {
    showCompressionDialog.value = false
  }

  const closeFileMention = () => {
    showFileMention.value = false
    fileMentionPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    mentionStart.value = -1
    mentionSearchText.value = ''
  }

  const formatMentionInsertText = (path: string) => {
    if (!path) {
      return '@'
    }

    if (/\s/.test(path)) {
      return `@"${path.replace(/"/g, '\\"')}"`
    }

    return `@${path}`
  }

  const openFileMention = (x: number, y: number, query: string, start: number) => {
    if (!sessionStore.currentSessionId || !currentProject.value) {
      return
    }

    showFileMention.value = true
    fileMentionPosition.value = { x, y, width: 280, height: 0 }
    mentionStart.value = start
    mentionSearchText.value = query
  }

  const handleFileSelect = (insertPath: string, mentionStartPos: number) => {
    closeFileMention()

    const textarea = textareaRef.value
    const cursorPos = textarea ? textarea.selectionStart : inputText.value.length
    const beforeAt = inputText.value.slice(0, mentionStartPos)
    const afterSearch = inputText.value.slice(cursorPos)
    const insertText = `${formatMentionInsertText(insertPath)} `

    inputText.value = sanitizeComposerText(beforeAt + insertText + afterSearch)

    nextTick(() => {
      if (textarea) {
        textarea.focus()
        const newPosition = beforeAt.length + insertText.length
        textarea.setSelectionRange(newPosition, newPosition)
      }
    })
  }

  const getCaretCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
    const text = textarea.value.substring(0, position)
    const lines = text.split('\n')
    const currentLine = lines.length - 1
    const currentCol = lines[lines.length - 1].length

    const style = window.getComputedStyle(textarea)
    const lineHeight = parseFloat(style.lineHeight)
    const paddingTop = parseFloat(style.paddingTop)
    const paddingLeft = parseFloat(style.paddingLeft)
    const fontSize = parseFloat(style.fontSize)
    const fontFamily = style.fontFamily

    const lineHeightActual = lineHeight || fontSize * 1.5
    const y = paddingTop + currentLine * lineHeightActual

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.font = `${fontSize}px ${fontFamily}`
      const textWidth = context.measureText(lines[lines.length - 1]).width
      canvas.remove()
      return { x: paddingLeft + textWidth, y }
    }
    canvas.remove()
    return { x: paddingLeft + currentCol * (fontSize * 0.6), y }
  }

  const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement
    let value = target.value
    let cursorPosition = target.selectionStart || 0
    const sanitizedValue = sanitizeComposerText(value)

    if (sanitizedValue !== value) {
      cursorPosition = sanitizeComposerText(value.slice(0, cursorPosition)).length
      value = sanitizedValue
      target.value = sanitizedValue
      target.setSelectionRange(cursorPosition, cursorPosition)
    }

    if (showFileMention.value && mentionStart.value >= 0) {
      if (value[mentionStart.value] !== '@') {
        closeFileMention()
      } else if (cursorPosition < mentionStart.value || cursorPosition > mentionStart.value + 100) {
        closeFileMention()
      } else {
        mentionSearchText.value = value.slice(mentionStart.value + 1, cursorPosition)
      }
      inputText.value = value
      return
    }

    if (value.length > 0 && cursorPosition > 0 && value[cursorPosition - 1] === '@') {
      const charBefore = cursorPosition > 1 ? value[cursorPosition - 2] : ' '
      if (charBefore === ' ' || charBefore === '\n' || charBefore === '\r' || cursorPosition === 1) {
        const rect = target.getBoundingClientRect()
        const caretPos = getCaretCoordinates(target, cursorPosition - 1)
        const x = rect.left + caretPos.x
        const y = rect.top + caretPos.y + 20
        openFileMention(x, y, '', cursorPosition - 1)
      }
    }

    inputText.value = value
  }

  const toPendingImage = async (attachment: MessageAttachment): Promise<PendingImageAttachment> => ({
    ...attachment,
    previewUrl: await resolveAttachmentPreviewUrl(attachment)
  })

  const uploadImages = async (files: File[]) => {
    const sessionId = currentSessionId.value
    if (!sessionId || files.length === 0) {
      return
    }

    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      notificationStore.warning(t('message.invalidImageFile'))
      return
    }

    try {
      sessionExecutionStore.setIsUploadingImages(sessionId, true)

      const payload: UploadImageInput[] = await Promise.all(imageFiles.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
      })))

      const result = await invoke<UploadSessionImagesResponse>('upload_session_images', {
        sessionId,
        projectPath: null,
        files: payload
      })

      const pendingImages = await Promise.all(result.attachments.map(toPendingImage))
      sessionExecutionStore.appendPendingImages(sessionId, pendingImages)
    } catch (error) {
      console.error('Failed to upload images:', error)
      notificationStore.smartError('上传图片', error instanceof Error ? error : new Error(String(error)))
    } finally {
      sessionExecutionStore.setIsUploadingImages(sessionId, false)
    }
  }

  const openImagePicker = () => {
    fileInputRef.value?.click()
  }

  const handleImageFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const files = target.files ? Array.from(target.files) : []
    target.value = ''
    await uploadImages(files)
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
    await uploadImages(imageFiles)
  }

  const removeImage = async (imageId: string) => {
    const sessionId = currentSessionId.value
    const image = pendingImages.value.find(item => item.id === imageId)
    if (!sessionId || !image) {
      return
    }

    try {
      await invoke('delete_uploaded_image', {
        sessionId,
        path: image.path
      })
      sessionExecutionStore.removePendingImage(sessionId, imageId)
    } catch (error) {
      console.error('Failed to delete uploaded image:', error)
      notificationStore.smartError('删除图片', error instanceof Error ? error : new Error(String(error)))
    }
  }

  const restorePendingImages = async (attachments: MessageAttachment[] = []) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    const pendingImages = await Promise.all(attachments.map(toPendingImage))
    sessionExecutionStore.setPendingImages(sessionId, pendingImages)
  }

  const buildQueuedMessagePreview = (draft: Pick<QueuedMessageDraft, 'content' | 'attachments'>) => {
    const trimmed = draft.content.trim()
    if (trimmed) {
      return trimmed
    }

    if (draft.attachments.length === 1) {
      return `[图片] ${draft.attachments[0].name}`
    }

    if (draft.attachments.length > 1) {
      return `[${draft.attachments.length} 张图片]`
    }

    return ''
  }

  const removeQueuedMessage = (draftId: string) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.removeQueuedMessage(currentSessionId.value, draftId)
  }

  const retryQueuedMessage = async (draftId: string) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.retryQueuedMessage(currentSessionId.value, draftId)
    if (!isSending.value) {
      await conversationService.drainQueue(currentSessionId.value)
    }
  }

  const sendWithCurrentAgent = async (
    userInput: string,
    attachments: MessageAttachment[]
  ): Promise<boolean> => {
    const sessionId = sessionStore.currentSessionId
    if ((!userInput.trim() && attachments.length === 0) || !sessionId || isSending.value) return false

    if (!currentAgent.value) {
      notificationStore.smartError('发送消息', new Error('请先选择一个智能体'))
      return false
    }

    const availability = conversationService.isAgentAvailable(currentAgent.value)
    if (!availability.available) {
      notificationStore.smartError('发送消息', new Error(availability.reason || '智能体不可用'))
      return false
    }

    try {
      const projectId = sessionStore.currentSession?.projectId
      await conversationService.sendMessage(
        sessionId,
        userInput,
        currentAgent.value.id,
        projectId,
        attachments
      )
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      notificationStore.smartError('发送消息', error instanceof Error ? error : new Error(String(error)))
      sessionExecutionStore.endSending(sessionId)
      return false
    }
  }

  const handleSend = async () => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId || isUploadingImages.value) return

    const rawInput = inputText.value
    const userInput = rawInput.trim()
    const attachments = pendingImages.value.map((image) => {
      const { previewUrl, ...attachment } = image
      void previewUrl
      return attachment
    })

    if (!userInput && attachments.length === 0) return

    if (isSending.value) {
      if (!currentAgent.value) {
        notificationStore.smartError('发送消息', new Error('请先选择一个智能体'))
        return
      }

      const availability = conversationService.isAgentAvailable(currentAgent.value)
      if (!availability.available) {
        notificationStore.smartError('发送消息', new Error(availability.reason || '智能体不可用'))
        return
      }

      sessionExecutionStore.queueMessage(sessionId, {
        content: userInput,
        attachments,
        agentId: currentAgent.value.id
      })
      inputText.value = ''
      sessionExecutionStore.clearPendingImages(sessionId)
      closeFileMention()
      return
    }

    const success = await sendWithCurrentAgent(userInput, attachments)
    if (success) {
      inputText.value = ''
      sessionExecutionStore.clearPendingImages(sessionId)
    } else {
      inputText.value = rawInput
    }
  }

  const handleMessageFormSubmit = async (
    formId: string,
    values: Record<string, unknown>,
    assistantMessageId?: string
  ) => {
    if (!currentSessionId.value || !currentAgent.value || isSending.value) {
      return
    }

    const payload = JSON.stringify({
      type: 'form_response',
      formId,
      values
    }, null, 2)

    await sendWithCurrentAgent(payload, [])
    void assistantMessageId
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (showFileMention.value) {
      return
    }

    if (event.key === 'Enter') {
      const sendOnEnter = settingsStore.settings.sendOnEnter

      if (sendOnEnter && !event.shiftKey) {
        event.preventDefault()
        void handleSend()
      } else if (!sendOnEnter && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void handleSend()
      }
    }
  }

  return {
    agentDropdownRef,
    agentOptions,
    closeFileMention,
    currentAgent,
    currentAgentId,
    currentAgentName,
    currentProject,
    currentSessionId,
    fileMentionPosition,
    fileInputRef,
    getModelLabel,
    handleCancelCompress,
    handleConfirmCompress,
    handleFileSelect,
    handleImageFileChange,
    handleInput,
    handleKeyDown,
    handleMessageFormSubmit,
    handleOpenCompress,
    handlePaste,
    handleSend,
    inputPlaceholder,
    inputText,
    isAgentDropdownOpen,
    isCompressing,
    isModelDropdownOpen,
    isSending,
    isUploadingImages,
    mentionSearchText,
    mentionStart,
    modelDropdownRef,
    openImagePicker,
    parsedInputText,
    pendingImages,
    queuedMessages,
    presetModelOptions,
    renderLayerRef,
    removeImage,
    removeQueuedMessage,
    restorePendingImages,
    retryQueuedMessage,
    selectedModelId,
    selectAgent,
    selectModel,
    shouldShowCompressButton,
    showCompressionDialog,
    showFileMention,
    syncScroll,
    textareaRef,
    toggleAgentDropdown,
    toggleModelDropdown,
    tokenUsage,
    messageCount,
    buildQueuedMessagePreview
  }
}
