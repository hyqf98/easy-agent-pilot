import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MessageAttachment } from './message'

export interface PendingImageAttachment extends MessageAttachment {
  previewUrl: string
}

export interface ComposerFileMention {
  id: string
  displayText: string
  fullPath: string
  titleText: string
  insertText?: string
}

export interface QueuedMessageDraft {
  id: string
  content: string
  displayContent?: string
  attachments: MessageAttachment[]
  expertId?: string
  agentId: string
  modelId?: string
  createdAt: string
  status: 'queued' | 'failed'
  errorMessage?: string
}

export interface SessionRetryState {
  assistantMessageId: string
  userMessageId: string
  current: number
  max: number
}

/**
 * 单个会话的执行状态
 */
export interface SessionExecutionState {
  /** 输入框内容 */
  inputText: string
  /** 输入框中的文件引用映射 */
  fileMentions: ComposerFileMention[]
  /** 待发送图片 */
  pendingImages: PendingImageAttachment[]
  /** 是否正在上传图片 */
  isUploadingImages: boolean
  /** 是否正在发送消息 */
  isSending: boolean
  /** 是否正在从待发送队列接力发起下一条消息 */
  isQueueDraining: boolean
  /** 是否正在等待自动重试 */
  isAwaitingRetry: boolean
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 流式输出定时器 ID */
  streamTimerId: ReturnType<typeof setInterval> | null
  /** 当前流式消息 ID */
  currentStreamingMessageId: string | null
  /** 当前正在展示的重试状态 */
  currentRetryState: SessionRetryState | null
  /** 同一条用户消息累计重试次数 */
  retryCountsByUserMessageId: Record<string, number>
  /** 待发送消息队列 */
  queuedMessages: QueuedMessageDraft[]
}

interface ComposerStateSnapshot {
  inputText: string
  fileMentions: ComposerFileMention[]
  pendingImages: PendingImageAttachment[]
}

/**
 * 会话执行状态管理 Store
 *
 * 用于管理每个会话独立的执行状态，确保：
 * - 每个会话有独立的输入框内容
 * - 每个会话有独立的发送/流式输出状态
 * - 会话切换时状态保持独立
 * - 关闭会话时清理对应状态
 */
export const useSessionExecutionStore = defineStore('sessionExecution', () => {
  // State - 使用 Map 存储每个会话的执行状态
  const executionStates = ref<Map<string, SessionExecutionState>>(new Map())
  const stateVersions = ref<Map<string, number>>(new Map())

  function touchState(sessionId: string) {
    stateVersions.value.set(sessionId, (stateVersions.value.get(sessionId) ?? 0) + 1)
  }

  /**
   * 获取指定会话的执行状态，如果不存在则创建默认状态
   */
  const getExecutionState = (sessionId: string): SessionExecutionState => {
    let state = executionStates.value.get(sessionId)
    if (!state) {
      state = createDefaultState()
      executionStates.value.set(sessionId, state)
      touchState(sessionId)
    }
    return state
  }

  function getStateVersion(sessionId: string): number {
    return stateVersions.value.get(sessionId) ?? 0
  }

  /**
   * 获取当前输入框内容（计算属性）
   */
  const getInputText = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).inputText
    }
  })

  /**
   * 获取当前发送状态（计算属性）
   */
  const getIsSending = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isSending
    }
  })

  const getIsQueueDraining = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isQueueDraining
    }
  })

  const getIsAwaitingRetry = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isAwaitingRetry
    }
  })

  const getIsBusy = computed(() => {
    return (sessionId: string) => {
      const state = getExecutionState(sessionId)
      return state.isSending || state.isQueueDraining || state.isAwaitingRetry
    }
  })

  const getPendingImages = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).pendingImages
    }
  })

  const getQueuedMessages = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).queuedMessages
    }
  })

  const getIsUploadingImages = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isUploadingImages
    }
  })

  /**
   * 获取当前流式输出状态（计算属性）
   */
  const getIsStreaming = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isStreaming
    }
  })

  const getCurrentRetryState = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).currentRetryState
    }
  })

  /**
   * 创建默认的执行状态
   */
  function createDefaultState(): SessionExecutionState {
    return {
      inputText: '',
      fileMentions: [],
      pendingImages: [],
      isUploadingImages: false,
      isSending: false,
      isQueueDraining: false,
      isAwaitingRetry: false,
      isStreaming: false,
      streamTimerId: null,
      currentStreamingMessageId: null,
      currentRetryState: null,
      retryCountsByUserMessageId: {},
      queuedMessages: []
    }
  }

  /**
   * 更新输入框内容
   */
  function setInputText(sessionId: string, text: string) {
    const state = getExecutionState(sessionId)
    state.inputText = text
    touchState(sessionId)
  }

  function getFileMentions(sessionId: string) {
    return getExecutionState(sessionId).fileMentions
  }

  function setFileMentions(sessionId: string, mentions: ComposerFileMention[]) {
    const state = getExecutionState(sessionId)
    state.fileMentions = mentions
    touchState(sessionId)
  }

  function setPendingImages(sessionId: string, images: PendingImageAttachment[]) {
    const state = getExecutionState(sessionId)
    state.pendingImages = images
    touchState(sessionId)
  }

  function appendPendingImages(sessionId: string, images: PendingImageAttachment[]) {
    const state = getExecutionState(sessionId)
    state.pendingImages = [...state.pendingImages, ...images]
    touchState(sessionId)
  }

  function removePendingImage(sessionId: string, imageId: string) {
    const state = getExecutionState(sessionId)
    state.pendingImages = state.pendingImages.filter(image => image.id !== imageId)
    touchState(sessionId)
  }

  function clearPendingImages(sessionId: string) {
    const state = getExecutionState(sessionId)
    state.pendingImages = []
    touchState(sessionId)
  }

  /**
   * 复制会话编辑器草稿态到另一个会话。
   * 用于压缩后切换新会话时，保留用户当前未发送的输入上下文。
   */
  function copyComposerState(sourceSessionId: string, targetSessionId: string) {
    if (!sourceSessionId || !targetSessionId || sourceSessionId === targetSessionId) {
      return
    }

    const sourceState = getExecutionState(sourceSessionId)
    const targetState = getExecutionState(targetSessionId)
    const snapshot: ComposerStateSnapshot = {
      inputText: sourceState.inputText,
      fileMentions: [...sourceState.fileMentions],
      pendingImages: [...sourceState.pendingImages]
    }

    targetState.inputText = snapshot.inputText
    targetState.fileMentions = snapshot.fileMentions
    targetState.pendingImages = snapshot.pendingImages
    touchState(targetSessionId)
  }

  function queueMessage(
    sessionId: string,
    draft: Omit<QueuedMessageDraft, 'id' | 'createdAt' | 'status'>
  ): QueuedMessageDraft {
    const state = getExecutionState(sessionId)
    const queuedDraft: QueuedMessageDraft = {
      ...draft,
      id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      status: 'queued'
    }
    state.queuedMessages = [...state.queuedMessages, queuedDraft]
    touchState(sessionId)
    return queuedDraft
  }

  function removeQueuedMessage(sessionId: string, draftId: string) {
    const state = getExecutionState(sessionId)
    state.queuedMessages = state.queuedMessages.filter(draft => draft.id !== draftId)
    touchState(sessionId)
  }

  function restoreQueuedMessage(sessionId: string, draft: QueuedMessageDraft) {
    const state = getExecutionState(sessionId)
    state.queuedMessages = [draft, ...state.queuedMessages]
    touchState(sessionId)
  }

  function updateQueuedMessage(
    sessionId: string,
    draftId: string,
    updates: Partial<Pick<QueuedMessageDraft, 'content' | 'displayContent' | 'attachments' | 'expertId' | 'agentId' | 'modelId' | 'status' | 'errorMessage'>>
  ) {
    const state = getExecutionState(sessionId)
    state.queuedMessages = state.queuedMessages.map(draft => {
      if (draft.id !== draftId) {
        return draft
      }

      return {
        ...draft,
        ...updates
      }
    })
    touchState(sessionId)
  }

  function popNextQueuedMessage(sessionId: string): QueuedMessageDraft | null {
    const state = getExecutionState(sessionId)
    const index = state.queuedMessages.findIndex(draft => draft.status === 'queued')
    if (index < 0) {
      return null
    }

    const [draft] = state.queuedMessages.splice(index, 1)
    touchState(sessionId)
    return draft ?? null
  }

  function markQueuedMessageStatus(
    sessionId: string,
    draftId: string,
    status: QueuedMessageDraft['status'],
    errorMessage?: string
  ) {
    const state = getExecutionState(sessionId)
    state.queuedMessages = state.queuedMessages.map(draft => {
      if (draft.id !== draftId) {
        return draft
      }

      return {
        ...draft,
        status,
        errorMessage
      }
    })
    touchState(sessionId)
  }

  function retryQueuedMessage(sessionId: string, draftId: string) {
    const state = getExecutionState(sessionId)
    state.queuedMessages = state.queuedMessages.map(draft => {
      if (draft.id !== draftId) {
        return draft
      }

      return {
        ...draft,
        status: 'queued',
        errorMessage: undefined
      }
    })
    touchState(sessionId)
  }

  function setIsUploadingImages(sessionId: string, uploading: boolean) {
    const state = getExecutionState(sessionId)
    state.isUploadingImages = uploading
    touchState(sessionId)
  }

  /**
   * 设置发送状态
   */
  function setIsSending(sessionId: string, sending: boolean) {
    const state = getExecutionState(sessionId)
    state.isSending = sending
    touchState(sessionId)
  }

  function setIsQueueDraining(sessionId: string, draining: boolean) {
    const state = getExecutionState(sessionId)
    state.isQueueDraining = draining
    touchState(sessionId)
  }

  function setIsAwaitingRetry(sessionId: string, awaiting: boolean) {
    const state = getExecutionState(sessionId)
    state.isAwaitingRetry = awaiting
    touchState(sessionId)
  }

  /**
   * 设置流式输出状态
   */
  function setIsStreaming(sessionId: string, streaming: boolean) {
    const state = getExecutionState(sessionId)
    state.isStreaming = streaming
    touchState(sessionId)
  }

  /**
   * 设置流式输出定时器 ID
   */
  function setStreamTimerId(sessionId: string, timerId: ReturnType<typeof setInterval> | null) {
    const state = getExecutionState(sessionId)
    state.streamTimerId = timerId
    touchState(sessionId)
  }

  /**
   * 设置当前流式消息 ID
   */
  function setCurrentStreamingMessageId(sessionId: string, messageId: string | null) {
    const state = getExecutionState(sessionId)
    state.currentStreamingMessageId = messageId
    touchState(sessionId)
  }

  function beginRetryAttempt(
    sessionId: string,
    payload: {
      assistantMessageId: string
      userMessageId: string
      max: number
    }
  ): SessionRetryState {
    const state = getExecutionState(sessionId)
    const nextCurrent = (state.retryCountsByUserMessageId[payload.userMessageId] ?? 0) + 1
    state.retryCountsByUserMessageId = {
      ...state.retryCountsByUserMessageId,
      [payload.userMessageId]: nextCurrent
    }
    state.currentRetryState = {
      assistantMessageId: payload.assistantMessageId,
      userMessageId: payload.userMessageId,
      current: nextCurrent,
      max: payload.max
    }
    touchState(sessionId)
    return state.currentRetryState
  }

  function clearCurrentRetryState(sessionId: string) {
    const state = getExecutionState(sessionId)
    state.currentRetryState = null
    touchState(sessionId)
  }

  /**
   * 开始发送消息 - 设置相关状态
   */
  function startSending(sessionId: string) {
    const state = getExecutionState(sessionId)
    state.isSending = true
    state.isQueueDraining = false
    state.isAwaitingRetry = false
    state.isStreaming = true
    touchState(sessionId)
  }

  /**
   * 结束发送消息 - 清除相关状态
   */
  function endSending(sessionId: string) {
    const state = getExecutionState(sessionId)
    state.isSending = false
    state.isQueueDraining = false
    state.isUploadingImages = false
    state.isStreaming = false
    state.streamTimerId = null
    state.currentStreamingMessageId = null
    touchState(sessionId)
  }

  /**
   * 停止流式输出
   */
  function stopStreaming(sessionId: string) {
    const state = getExecutionState(sessionId)

    // 清除定时器
    if (state.streamTimerId) {
      clearInterval(state.streamTimerId)
      state.streamTimerId = null
    }

    // 重置状态
    state.isSending = false
    state.isQueueDraining = false
    state.isStreaming = false
    state.currentStreamingMessageId = null
    touchState(sessionId)
  }

  /**
   * 清除指定会话的执行状态
   * 在关闭会话时调用
   */
  function clearExecutionState(sessionId: string) {
    const state = executionStates.value.get(sessionId)
    if (state) {
      // 清除可能存在的定时器
      if (state.streamTimerId) {
        clearInterval(state.streamTimerId)
      }
      // 删除状态
      executionStates.value.delete(sessionId)
      stateVersions.value.delete(sessionId)
    }
  }

  /**
   * 清除所有会话的执行状态
   */
  function clearAllExecutionStates() {
    // 清除所有定时器
    executionStates.value.forEach((state) => {
      if (state.streamTimerId) {
        clearInterval(state.streamTimerId)
      }
    })
    executionStates.value.clear()
    stateVersions.value.clear()
  }

  /**
   * 检查是否有会话正在执行
   */
  const hasAnyRunningSession = computed(() => {
    for (const state of executionStates.value.values()) {
      if (state.isSending || state.isStreaming || state.isAwaitingRetry) {
        return true
      }
    }
    return false
  })

  /**
   * 获取所有正在执行的会话 ID
   */
  const runningSessionIds = computed(() => {
    const ids: string[] = []
    executionStates.value.forEach((state, sessionId) => {
      if (state.isSending || state.isStreaming || state.isAwaitingRetry) {
        ids.push(sessionId)
      }
    })
    return ids
  })

  return {
    // State
    executionStates,

    // Getters
    getInputText,
    getFileMentions,
    getPendingImages,
    getQueuedMessages,
    getIsUploadingImages,
    getIsSending,
    getIsQueueDraining,
    getIsAwaitingRetry,
    getIsBusy,
    getIsStreaming,
    getCurrentRetryState,
    getStateVersion,
    hasAnyRunningSession,
    runningSessionIds,

    // Actions
    getExecutionState,
    setInputText,
    setFileMentions,
    setPendingImages,
    appendPendingImages,
    removePendingImage,
    clearPendingImages,
    copyComposerState,
    queueMessage,
    removeQueuedMessage,
    restoreQueuedMessage,
    updateQueuedMessage,
    popNextQueuedMessage,
    markQueuedMessageStatus,
    retryQueuedMessage,
    setIsUploadingImages,
    setIsSending,
    setIsQueueDraining,
    setIsAwaitingRetry,
    setIsStreaming,
    setStreamTimerId,
    setCurrentStreamingMessageId,
    beginRetryAttempt,
    clearCurrentRetryState,
    startSending,
    endSending,
    stopStreaming,
    clearExecutionState,
    clearAllExecutionStates
  }
})
