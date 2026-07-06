/**
 * useComposerQueuedMessages — 队列消息草稿（QueuedMessageDraft）的增删改与立即发送。
 *
 * 职责说明：
 * - 队列消息预览：buildQueuedMessagePreview。
 * - 增删改：removeQueuedMessage / updateQueuedMessage / retryQueuedMessage。
 * - 立即发送：sendImmediatelyQueuedMessage（绕过队列，强制清空执行态后直接发送，
 *   内部解析草稿的 expertId / agentId 并回退到首个可用执行器）。
 * buildAttachmentPreview 由 useComposerAttachments 提供（单向依赖：queued → attachments）。
 */
import { useSessionStore } from '@/stores/session'
import type { MessageAttachment } from '@/stores/message'
import type { QueuedMessageDraft } from '@/stores/sessionExecution'
import { conversationService } from '@/services/conversation'
import { getErrorMessage } from '@/utils/api'
import { writeFrontendRuntimeLog } from '@/services/runtimeLog/client'
import {
  resolveSubAgentById,
  resolveSubAgentExecutionWithFallback,
  resolveFallbackAgent,
  buildSubAgentSystemPrompt
} from '@/services/subAgent/runtime'
import type { ComposerSharedContext } from './useComposerShared'

/** attachments 子 composable 中需要被消费的最小切片。 */
export interface ComposerQueuedAttachmentsDeps {
  buildAttachmentPreview: (attachments: MessageAttachment[]) => string
}

export function useComposerQueuedMessages(
  ctx: ComposerSharedContext,
  attachments: ComposerQueuedAttachmentsDeps
) {
  const {
    agentStore,
    agentTeamsStore,
    sessionExecutionStore,
    notificationStore,
    currentSessionId,
    currentWorkingDirectory,
    currentProjectPath,
    isSending,
    dispatchingSessionId
  } = ctx

  const buildQueuedMessagePreview = (draft: Pick<QueuedMessageDraft, 'content' | 'displayContent' | 'attachments'>) => {
    const trimmed = (draft.displayContent ?? draft.content).trim()
    if (trimmed) {
      return trimmed
    }

    return attachments.buildAttachmentPreview(draft.attachments)
  }

  const removeQueuedMessage = (draftId: string) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.removeQueuedMessage(currentSessionId.value, draftId)
  }

  const updateQueuedMessage = (
    draftId: string,
    updates: Partial<Pick<QueuedMessageDraft, 'content' | 'displayContent' | 'attachments' | 'expertId' | 'agentId' | 'modelId' | 'status' | 'errorMessage'>>
  ) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.updateQueuedMessage(currentSessionId.value, draftId, updates)
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

  const sendImmediatelyQueuedMessage = async (draftId: string) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    const state = sessionExecutionStore.getExecutionState(sessionId)
    const draft = state.queuedMessages.find(item => item.id === draftId)
    if (!draft || draft.status !== 'queued') {
      return
    }

    if (state.isSending || state.isStreaming || state.isQueueDraining) {
      conversationService.forceResetSendingState(sessionId)
    }

    sessionExecutionStore.removeQueuedMessage(sessionId, draftId)

    const sessionStore = useSessionStore()
    const targetSession = sessionStore.sessions.find(session => session.id === sessionId) || null
    const expert = draft.expertId ? resolveSubAgentById(draft.expertId, agentTeamsStore.subAgents) : null
    // 优先按草稿 agentId 解析执行器，找不到则回退（兼容主会话不再绑定专家的场景）
    const baseAgent = agentStore.agents.find(item => item.id === draft.agentId)
      || resolveFallbackAgent(agentStore.agents)
    const expertRuntime = expert ? resolveSubAgentExecutionWithFallback(expert, agentStore.agents) : null
    const runtimeAgent = expertRuntime?.agent || baseAgent
    const executionAgent = runtimeAgent
      ? {
          ...runtimeAgent,
          modelId: draft.modelId || expertRuntime?.modelId || runtimeAgent.modelId
        }
      : null

    if (!executionAgent) {
      sessionExecutionStore.restoreQueuedMessage(sessionId, { ...draft, status: 'failed', errorMessage: '未找到可用 ACP 客户端' })
      return
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      sessionExecutionStore.restoreQueuedMessage(sessionId, { ...draft, status: 'failed', errorMessage: availability.reason || '当前 ACP 客户端不可用' })
      return
    }

    dispatchingSessionId.value = sessionId

    try {
      if (targetSession?.expertId !== (expert?.id ?? '') || targetSession?.agentId !== executionAgent.id) {
        await sessionStore.updateSession(sessionId, {
          expertId: expert?.id || '',
          agentId: executionAgent.id,
          agentType: executionAgent.provider || executionAgent.type || 'claude',
          cliSessionId: '',
          cliSessionProvider: ''
        })
      }

      const injectedSystemMessages = expert ? [buildSubAgentSystemPrompt(expert.prompt)] : []

      await conversationService.sendMessage(
        sessionId,
        draft.content,
        executionAgent.id,
        targetSession?.projectId,
        draft.attachments,
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: draft.modelId || undefined,
          injectedSystemMessages,
          previewContent: draft.displayContent
        }
      )
    } catch (error) {
      console.error('Failed to send queued message immediately:', error)
      const normalizedError = error instanceof Error
        ? error
        : new Error(getErrorMessage(error, '立即发送失败'))
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-composer',
        `sendImmediatelyQueuedMessage failed | sessionId=${sessionId} | draftId=${draftId} | error=${normalizedError.message}`,
        error
      )
      notificationStore.smartError('立即发送失败', normalizedError)
      sessionExecutionStore.endSending(sessionId)
    } finally {
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  return {
    buildQueuedMessagePreview,
    removeQueuedMessage,
    updateQueuedMessage,
    retryQueuedMessage,
    sendImmediatelyQueuedMessage
  }
}
