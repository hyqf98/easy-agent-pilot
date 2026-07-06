/**
 * useComposerSender — 会话发送主编排（最大块）。
 *
 * 职责说明：
 * - 执行器解析：getExecutionAgentConfig / validateCurrentAgentAvailability / buildQueuedMessageDraft。
 * - 草稿清空：clearComposerDraft。
 * - 会话清理：clearCurrentSession。
 * - 发送原语：sendWithCurrentAgent / sendWithExpert。
 * - 计划模式：executePlan / cancelPlan / executeCurrentPlan / sendWithPlanMode。
 * - 项目初始化：runProjectInit / createSessionAndSend。
 * - 斜杠命令运行：runSlashCommand。
 * - 发送入口：handleSend / retryMessage / editAndResendMessage / handleMessageFormSubmit。
 * 该模块是发送链路的最终编排者，依赖几乎所有其它子 composable；为打破循环依赖，
 * 它通过回调形式接收 sender.handleSend（被 input 子 composable 反向消费）。
 */
import { nextTick } from 'vue'
import type { CompressionStrategy } from '@/stores/token'
import type { MessageAttachment } from '@/stores/message'
import type { QueuedMessageDraft } from '@/stores/sessionExecution'
import { inferAgentProvider } from '@/stores/agent'
import { conversationService } from '@/services/conversation'
import { compressionService } from '@/services/compression'
import {
  parseSlashCommandInput,
  executeSlashCommand,
  type ParsedSlashCommand
} from '@/services/slashCommands'
import { getErrorMessage } from '@/utils/api'
import { writeFrontendRuntimeLog } from '@/services/runtimeLog/client'
import {
  buildSubAgentSystemPrompt,
  resolveSubAgentById,
  resolveSubAgentExecutionWithFallback,
  resolveFallbackAgent
} from '@/services/subAgent/runtime'
import { buildProjectInitPrompt, composerDebug } from './composerHelpers'
import type { ComposerSharedContext } from './useComposerShared'

/** fileMentions 子 composable 中需要被消费的最小切片。 */
export interface ComposerSenderFileMentionsDeps {
  expandComposerMentions: (text: string, mentions: import('@/stores/sessionExecution').ComposerFileMention[]) => string
  closeFileMention: () => void
  closeSlashCommand: () => void
  closeCdPathSuggestions: () => void
}

/** attachments 子 composable 中需要被消费的最小切片。 */
export interface ComposerSenderAttachmentsDeps {
  restorePendingImages: (attachments?: MessageAttachment[]) => Promise<void>
}

/** 压缩对话框（位于 shared，但通过依赖注入以保持 sender 与 shared 解耦）。 */
export interface ComposerSenderCompressDeps {
  handleOpenCompress: () => void
}

export function useComposerSender(
  ctx: ComposerSharedContext,
  fileMentions: ComposerSenderFileMentionsDeps,
  attachments: ComposerSenderAttachmentsDeps,
  compress: ComposerSenderCompressDeps
) {
  const {
    t,
    messageStore,
    sessionStore,
    settingsStore,
    notificationStore,
    projectStore,
    agentStore,
    sessionExecutionStore,
    tokenStore,
    agentTeamsStore,
    agentPlanStore,
    currentSessionId,
    currentSession,
    currentProjectPath,
    currentWorkingDirectory,
    inputText,
    isSending,
    pendingImages,
    dispatchingSessionId,
    isCurrentSessionDispatching,
    isUploadingImages,
    isCompressing,
    selectedModelId,
    currentAgent,
    currentExpert,
    isModelDropdownOpen,
    isAgentDropdownOpen,
    isReasoningDropdownOpen,
    messageCount,
    focusInput
  } = ctx

  const getExecutionAgentConfig = () => {
    if (!currentAgent.value) {
      return null
    }

    const selectedModel = selectedModelId.value.trim()
    if (!selectedModel) {
      return currentAgent.value
    }

    return {
      ...currentAgent.value,
      modelId: selectedModel
    }
  }

  const validateCurrentAgentAvailability = () => {
    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      notificationStore.smartError('发送失败', new Error('未找到可用 ACP 客户端'))
      return false
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      notificationStore.smartError('发送失败', new Error(availability.reason || '当前 ACP 客户端不可用'))
      return false
    }

    return true
  }

  const buildQueuedMessageDraft = (
    userInput: string,
    rawInput: string,
    attachmentsInput: MessageAttachment[],
    displayPreviewContent?: string
  ): Omit<QueuedMessageDraft, 'id' | 'createdAt' | 'status'> | null => {
    const queuedExpert = currentExpert.value
    const queuedAgent = currentAgent.value
    if (!queuedAgent) {
      return null
    }

    return {
      content: userInput,
      displayContent: displayPreviewContent || rawInput,
      attachments: attachmentsInput,
      expertId: queuedExpert?.id || '',
      agentId: queuedAgent.id,
      modelId: selectedModelId.value.trim() || undefined
    }
  }

  const clearComposerDraft = (sessionId: string) => {
    inputText.value = ''
    sessionExecutionStore.clearPendingImages(sessionId)
    fileMentions.closeFileMention()
    fileMentions.closeSlashCommand()
    fileMentions.closeCdPathSuggestions()
  }

  const sendWithCurrentAgent = async (
    userInput: string,
    attachmentsInput: MessageAttachment[],
    sendOptions?: {
      displayPreviewContent?: string
      reuseAssistantMessageId?: string
      targetSessionId?: string
    }
  ): Promise<boolean> => {
    const sessionId = sendOptions?.targetSessionId ?? currentSessionId.value
    if ((!userInput.trim() && attachmentsInput.length === 0) || !sessionId || isSending.value) return false

    const targetSession = sessionStore.sessions.find(session => session.id === sessionId) || null
    const expert = currentExpert.value
    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      notificationStore.smartError('发送失败', new Error('未找到可用 ACP 客户端'))
      return false
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      notificationStore.smartError('发送失败', new Error(availability.reason || '当前 ACP 客户端不可用'))
      return false
    }

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

      // 仅当会话遗留专家 persona 时才注入其系统提示；主会话默认直接用 ACP 客户端
      const injectedSystemMessages = expert ? [buildSubAgentSystemPrompt(expert.prompt)] : []

      await conversationService.sendMessage(
        sessionId,
        userInput,
        executionAgent.id,
        targetSession?.projectId,
        attachmentsInput,
        {
          workingDirectory: currentWorkingDirectory.value || undefined,
          modelId: selectedModelId.value.trim() || undefined,
          reasoningEffort: ctx.selectedReasoningEffort.value || undefined,
          injectedSystemMessages,
          previewContent: sendOptions?.displayPreviewContent,
          reuseAssistantMessageId: sendOptions?.reuseAssistantMessageId
        }
      )
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      const normalizedError = error instanceof Error
        ? error
        : new Error(getErrorMessage(error, '发送失败'))
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-composer',
        `sendWithCurrentAgent failed | sessionId=${sessionId} | projectId=${currentSession.value?.projectId || ''} | agentId=${executionAgent.id} | expertId=${expert?.id || ''} | error=${normalizedError.message}`,
        error
      )
      notificationStore.smartError('发送失败', normalizedError)
      sessionExecutionStore.endSending(sessionId)
      return false
    }
  }

  const clearCurrentSession = async () => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    await messageStore.clearSessionMessages(sessionId)
    sessionExecutionStore.clearExecutionState(sessionId)
    sessionExecutionStore.setInputText(sessionId, '')
    focusInput()
  }

  const sendWithExpert = async (sendInput: {
    expertId: string
    userInput: string
    previewContent?: string
    targetSessionId?: string
  }): Promise<boolean> => {
    const sessionId = sendInput.targetSessionId ?? currentSessionId.value
    if (!sessionId || !sendInput.userInput.trim() || isSending.value) {
      return false
    }

    await Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents()
    ])

    const targetSession = sessionStore.sessions.find(session => session.id === sessionId) || null
    const expert = resolveSubAgentById(sendInput.expertId, agentTeamsStore.subAgents)
    const runtime = resolveSubAgentExecutionWithFallback(expert, agentStore.agents)
    const executionAgent = runtime?.agent
      ? {
          ...runtime.agent,
          modelId: runtime.modelId || runtime.agent.modelId
        }
      : null

    if (!expert || !executionAgent) {
      notificationStore.smartError('发送失败', new Error('未找到可用专家运行时'))
      return false
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      notificationStore.smartError('发送失败', new Error(availability.reason || '当前专家运行时不可用'))
      return false
    }

    try {
      if (targetSession?.expertId !== expert.id || targetSession?.agentId !== executionAgent.id) {
        await sessionStore.updateSession(sessionId, {
          expertId: expert.id,
          agentId: executionAgent.id,
          agentType: executionAgent.provider || executionAgent.type || 'claude',
          cliSessionId: '',
          cliSessionProvider: ''
        })
      }

      await conversationService.sendMessage(
        sessionId,
        sendInput.userInput,
        executionAgent.id,
        targetSession?.projectId,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: executionAgent.modelId?.trim() || undefined,
          injectedSystemMessages: [
            buildSubAgentSystemPrompt(expert.prompt)
          ],
          previewContent: sendInput.previewContent
        }
      )
      return true
    } catch (error) {
      console.error('Failed to send message with expert:', error)
      const normalizedError = error instanceof Error
        ? error
        : new Error(getErrorMessage(error, '发送失败'))
      notificationStore.smartError('发送失败', normalizedError)
      sessionExecutionStore.endSending(sessionId)
      return false
    }
  }

  const runProjectInit = async (extraPrompt?: string): Promise<void> => {
    const sessionId = currentSessionId.value
    const projectPath = currentProjectPath.value

    if (!sessionId) {
      throw new Error('当前没有可用会话')
    }

    if (!projectPath) {
      throw new Error('当前会话未绑定项目，无法执行 /init')
    }

    const executionAgent = getExecutionAgentConfig()
    const provider = executionAgent
      ? (executionAgent.provider || inferAgentProvider(executionAgent))
      : null

    if (provider === 'claude') {
      const initPrompt = '/init'
      const fullPrompt = extraPrompt?.trim()
        ? `${initPrompt}\n\n${extraPrompt.trim()}`
        : initPrompt

      await conversationService.sendMessage(
        sessionId,
        fullPrompt,
        executionAgent!.id,
        projectStore.currentProjectId ?? undefined,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: executionAgent!.modelId?.trim() || undefined,
          previewContent: extraPrompt?.trim() ? `/init ${extraPrompt.trim()}` : '/init'
        }
      )
      return
    }

    await agentTeamsStore.loadSubAgents()
    const architectExpert = agentTeamsStore.builtinArchitectSubAgent
      || agentTeamsStore.enabledSubAgents.find(expert => expert.category === 'architect')
      || null

    if (!architectExpert) {
      throw new Error('未找到架构分析专家')
    }

    const success = await sendWithExpert({
      expertId: architectExpert.id,
      userInput: buildProjectInitPrompt(projectPath, extraPrompt),
      previewContent: extraPrompt?.trim() ? `/init ${extraPrompt.trim()}` : '/init',
      targetSessionId: sessionId
    })

    if (!success) {
      throw new Error('/init 执行失败')
    }
  }

  const createSessionAndSend = async (message?: string, displayContent?: string): Promise<void> => {
    if (!projectStore.currentProjectId) {
      throw new Error('当前没有可用项目')
    }

    await Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents(true)
    ])
    // 主会话不再默认绑定通用代理/专家，直接用首个可用 ACP 客户端作为执行器
    const fallbackAgent = resolveFallbackAgent(agentStore.agents)

    const titleSource = displayContent ?? message
    const newSession = await sessionStore.createSession({
      projectId: projectStore.currentProjectId,
      name: titleSource ? titleSource.replace(/\n/g, ' ').slice(0, 20).trim() + (titleSource.length > 20 ? '...' : '') : '未命名会话',
      agentId: fallbackAgent?.id,
      agentType: fallbackAgent?.provider || fallbackAgent?.type || 'claude',
      status: 'idle'
    })
    projectStore.incrementSessionCount(projectStore.currentProjectId)

    await sessionStore.openSession(newSession.id)

    const contentToSend = displayContent ?? message?.trim()
    if (contentToSend && fallbackAgent) {
      await conversationService.sendMessage(
        newSession.id,
        contentToSend,
        fallbackAgent.id,
        projectStore.currentProjectId,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: fallbackAgent.modelId || undefined,
          injectedSystemMessages: [],
        }
      )
    }
  }

  const PLAN_MODE_SYSTEM_PROMPT = 'You are in plan mode. Analyze the task and provide a detailed plan, but do NOT make any file changes or execute any commands. Only read files to understand the codebase, then output your analysis and plan. Respond with a clear, actionable plan that another agent could execute.'

  const sendWithPlanMode = async (message: string, planOptions?: { persistPlanMode?: boolean; displayContent?: string }): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      throw new Error('当前没有可用会话')
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      throw new Error('未找到可用专家运行时')
    }

    const provider = executionAgent.provider || inferAgentProvider(executionAgent)
    let extraCliArgs: string[] | undefined
    let planSystemPrompt: string | undefined

    switch (provider) {
      case 'claude':
        extraCliArgs = ['--permission-mode', 'plan']
        break
      case 'codex':
        extraCliArgs = ['-s', 'read-only']
        break
      default:
        planSystemPrompt = PLAN_MODE_SYSTEM_PROMPT
        break
    }

    const expert = resolveSubAgentById(currentExpert.value?.id, agentTeamsStore.subAgents)
    const systemMessages: string[] = []
    if (expert) {
      systemMessages.push(buildSubAgentSystemPrompt(expert.prompt))
    }
    if (planSystemPrompt) {
      systemMessages.push(planSystemPrompt)
    }

    await conversationService.sendMessage(
      sessionId,
      planOptions?.displayContent ?? message,
      executionAgent.id,
      projectStore.currentProjectId ?? undefined,
      [],
      {
        workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
        modelId: executionAgent.modelId?.trim() || undefined,
        extraCliArgs,
        injectedSystemMessages: systemMessages,
      }
    )

    if (planOptions?.persistPlanMode) {
      const lastMsg = messageStore.lastMessage(sessionId)
      if (lastMsg?.status === 'completed') {
        await sessionStore.setPlanMode(sessionId, true)
      }
    }
  }

  const executePlan = async (): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    await sessionStore.setPlanMode(sessionId, false)
  }

  const cancelPlan = async (): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    await sessionStore.setPlanMode(sessionId, false)
  }

  /**
   * 计划就绪 →「开始执行」：
   * 退出计划模式，并以普通模式（不带 --permission-mode plan / 只读）自动发送一条
   * 执行指令，让 Agent 真正动手按计划落地；随后清除待确认状态。
   */
  const executeCurrentPlan = async (): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      agentPlanStore.clearConfirm(sessionId)
      return
    }

    await sessionStore.setPlanMode(sessionId, false)

    try {
      await conversationService.sendMessage(
        sessionId,
        t('plan.executePrompt'),
        executionAgent.id,
        projectStore.currentProjectId ?? undefined,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: executionAgent.modelId?.trim() || undefined
        }
      )
    } catch (err) {
      console.error('[executeCurrentPlan] auto-send failed', err)
    } finally {
      agentPlanStore.clearConfirm(sessionId)
    }
  }

  const runSlashCommand = async (parsedSlashCommand: ParsedSlashCommand) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return false
    }

    const result = await executeSlashCommand(parsedSlashCommand, {
      panelType: ctx.options.panelType,
      sessionId,
      isSending: isSending.value,
      hasMessages: messageCount.value > 0,
      currentWorkingDirectory: currentWorkingDirectory.value,
      openCompressionDialog: compress.handleOpenCompress,
      clearSession: clearCurrentSession,
      setWorkingDirectory: ctx.options.setWorkingDirectory,
      runProjectInit,
      createSessionAndSend,
      sendWithPlanMode,
      openModelPicker: () => {
        isModelDropdownOpen.value = true
        isAgentDropdownOpen.value = false
        isReasoningDropdownOpen.value = false
      },
      notifySuccess: message => notificationStore.success(message),
      notifyWarning: message => notificationStore.warning(message),
      notifyError: message => notificationStore.error(t('common.error'), message)
    })

    if (result.handled) {
      fileMentions.closeSlashCommand()
      fileMentions.closeCdPathSuggestions()
    }

    return result.handled
  }

  const handleSend = async () => {
    const sessionId = currentSessionId.value
    if (!sessionId || isUploadingImages.value) return

    const rawInput = inputText.value
    const expandedInput = fileMentions.expandComposerMentions(rawInput, ctx.currentFileMentions.value).trim()
    const userInput = expandedInput
    const displayInput = rawInput.trim()
    const attachmentsPayload = pendingImages.value.map((image) => {
      const { previewUrl, ...attachment } = image
      void previewUrl
      return attachment
    })

    composerDebug('send', { rawLen: rawInput.length, expandedLen: expandedInput.length, attachCount: attachmentsPayload.length })

    if (!displayInput && attachmentsPayload.length === 0) {
      if (isSending.value) {
        await conversationService.abort(sessionId)
      }
      return
    }

    const parsedSlashCommand = attachmentsPayload.length === 0 ? parseSlashCommandInput(userInput) : null
    if (parsedSlashCommand) {
      clearComposerDraft(sessionId)
      await nextTick()
      const handled = await runSlashCommand(parsedSlashCommand)
      if (handled) {
        return
      }
      inputText.value = rawInput
      focusInput()
    }

    if (isSending.value || isCurrentSessionDispatching.value) {
      if (!validateCurrentAgentAvailability()) {
        return
      }

      const queuedDraft = buildQueuedMessageDraft(
        userInput,
        rawInput,
        attachmentsPayload,
        expandedInput
      )
      if (!queuedDraft) {
        return
      }

      sessionExecutionStore.queueMessage(sessionId, queuedDraft)
      clearComposerDraft(sessionId)
      focusInput()
      return
    }

    if (!validateCurrentAgentAvailability()) {
      return
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      return
    }

    try {
      if (compressionService.shouldAutoCompressSession(sessionId)) {
        const queuedDraft = buildQueuedMessageDraft(
          userInput,
          rawInput,
          attachmentsPayload,
          expandedInput
        )
        if (!queuedDraft) {
          return
        }

        const queuedMessage = sessionExecutionStore.queueMessage(sessionId, queuedDraft)
        clearComposerDraft(sessionId)
        focusInput()
        isCompressing.value = true
        const result = await compressionService.compressSession(
          sessionId,
          executionAgent.id,
          {
            strategy: settingsStore.settings.compressionStrategy as CompressionStrategy,
            triggerSource: 'auto'
          }
        )
        isCompressing.value = false

        if (!result.success) {
          sessionExecutionStore.removeQueuedMessage(sessionId, queuedMessage.id)
          inputText.value = rawInput
          await attachments.restorePendingImages(attachmentsPayload)
          notificationStore.error(t('compression.failed'), result.error)
          focusInput()
          return
        }

        notificationStore.success(t('compression.success'))
        await nextTick()
        await conversationService.drainQueue(sessionId)
        focusInput()
        return
      }

      dispatchingSessionId.value = sessionId
      clearComposerDraft(sessionId)
      await nextTick()

      if (sessionStore.isPlanMode(sessionId)) {
        try {
          await sendWithPlanMode(userInput)
          focusInput()
        } catch (error) {
          inputText.value = rawInput
          await attachments.restorePendingImages(attachmentsPayload)
          const normalizedError = error instanceof Error ? error : new Error(getErrorMessage(error, '发送失败'))
          notificationStore.smartError('发送失败', normalizedError)
          focusInput()
        }
      } else {
        const success = await sendWithCurrentAgent(userInput, attachmentsPayload, {
          displayPreviewContent: expandedInput,
          targetSessionId: sessionId
        })
        if (success) {
          focusInput()
        } else {
          inputText.value = rawInput
          await attachments.restorePendingImages(attachmentsPayload)
          focusInput()
        }
      }
    } finally {
      isCompressing.value = false
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  const retryMessage = async (
    messageId: string,
    content: string,
    attachmentsInput: MessageAttachment[] = [],
    replaceMessageId?: string
  ) => {    const sessionId = currentSessionId.value
    const normalizedContent = content.trim()
    if (!sessionId || isUploadingImages.value || isSending.value || isCurrentSessionDispatching.value) {
      return false
    }

    if (!normalizedContent && attachmentsInput.length === 0) {
      return false
    }

    if (!validateCurrentAgentAvailability()) {
      return false
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      return false
    }

    dispatchingSessionId.value = sessionId

    try {
      if (replaceMessageId && replaceMessageId !== messageId) {
        await messageStore.deleteMessage(replaceMessageId)
      }

      // 主会话直接用选定的 ACP 客户端；仅当会话遗留了专家 persona 时才注入其系统提示
      const expert = currentExpert.value
      const injectedSystemMessages = expert
        ? [buildSubAgentSystemPrompt(expert.prompt)]
        : []

      await conversationService.sendMessage(
        sessionId,
        normalizedContent,
        executionAgent.id,
        currentSession.value?.projectId,
        attachmentsInput,
        {
          workingDirectory: currentWorkingDirectory.value || undefined,
          modelId: selectedModelId.value.trim() || undefined,
          injectedSystemMessages,
          existingUserMessageId: messageId
        }
      )
      focusInput()
      return true
    } catch (error) {
      console.error('Failed to retry message:', error)
      notificationStore.smartError('重试失败', error instanceof Error ? error : new Error(String(error)))
      sessionExecutionStore.endSending(sessionId)
      return false
    } finally {
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  // 编辑用户消息并重发：持久化新内容 → 删除该消息之后的所有消息 → 以既有用户消息重新生成
  const editAndResendMessage = async (
    messageId: string,
    content: string,
    attachmentsInput: MessageAttachment[] = []
  ): Promise<boolean> => {
    const sessionId = currentSessionId.value
    const normalizedContent = content.trim()
    if (!sessionId || isUploadingImages.value || isSending.value || isCurrentSessionDispatching.value) {
      return false
    }

    if (!normalizedContent && attachmentsInput.length === 0) {
      return false
    }

    if (!validateCurrentAgentAvailability()) {
      return false
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      return false
    }

    dispatchingSessionId.value = sessionId

    try {
      // 1. 持久化编辑后的用户消息内容
      await messageStore.updateMessage(messageId, { content: normalizedContent })

      // 2. 删除该消息之后的所有消息（清空下方 AI 响应）
      await messageStore.deleteMessagesAfter(sessionId, messageId)

      // 3. 失效该会话用量缓存（删除的消息用量记录会被清除，需重新聚合）
      tokenStore.invalidateSessionUsageSummary(sessionId)

      // 4. 以既有用户消息重新发送（注入专家系统提示，与 retryMessage 一致）
      const expert = currentExpert.value
      const injectedSystemMessages = expert
        ? [buildSubAgentSystemPrompt(expert.prompt)]
        : []

      await conversationService.sendMessage(
        sessionId,
        normalizedContent,
        executionAgent.id,
        currentSession.value?.projectId,
        attachmentsInput,
        {
          workingDirectory: currentWorkingDirectory.value || undefined,
          modelId: selectedModelId.value.trim() || undefined,
          injectedSystemMessages,
          existingUserMessageId: messageId
        }
      )
      focusInput()
      return true
    } catch (error) {
      console.error('Failed to edit and resend message:', error)
      notificationStore.smartError('编辑重发失败', error instanceof Error ? error : new Error(String(error)))
      sessionExecutionStore.endSending(sessionId)
      return false
    } finally {
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  const handleMessageFormSubmit = async (
    formId: string,
    values: Record<string, unknown>
  ) => {
    if (!currentSessionId.value || !currentAgent.value || isSending.value || isCurrentSessionDispatching.value) {
      return
    }

    const payload = JSON.stringify({
      type: 'form_response',
      formId,
      values
    }, null, 2)

    await sendWithCurrentAgent(payload, [])
  }

  return {
    getExecutionAgentConfig,
    validateCurrentAgentAvailability,
    buildQueuedMessageDraft,
    clearComposerDraft,
    clearCurrentSession,
    sendWithCurrentAgent,
    sendWithExpert,
    runProjectInit,
    createSessionAndSend,
    sendWithPlanMode,
    executePlan,
    cancelPlan,
    executeCurrentPlan,
    runSlashCommand,
    handleSend,
    retryMessage,
    editAndResendMessage,
    handleMessageFormSubmit
  }
}
