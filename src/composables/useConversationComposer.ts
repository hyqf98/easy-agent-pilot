/**
 * useConversationComposer — 会话输入框（ConversationComposer）的聚合器。
 *
 * 职责说明：
 * - 本文件不再承载任何业务逻辑，仅负责：
 *   1. 实例化共享上下文（useComposerShared，作为单一事实源）；
 *   2. 按依赖顺序实例化各职责子 composable（dropdowns / fileMentions / attachments /
 *      queuedMessages / sender / input / slashCommands / cdPath），并通过参数注入共享依赖；
 *   3. 将各子 composable 的返回值按调用方期望的结构原样展平返回（模板依赖这些绑定，结构不可变）。
 * - 子 composable 之间的循环依赖（input.handleKeyDown → sender.handleSend、
 *   slash/cd → input.updateSlashCommandState）通过“先创建 sender 并以 lazy 句柄注入 input”打破：
 *   sender 先实例化，其 handleSend 通过闭包引用稍后才被赋值的 input 句柄。
 */
import { useComposerShared } from './conversationComposer/useComposerShared'
import { useComposerDropdowns } from './conversationComposer/useComposerDropdowns'
import { useComposerFileMentions } from './conversationComposer/useComposerFileMentions'
import { useComposerAttachments } from './conversationComposer/useComposerAttachments'
import { useComposerQueuedMessages } from './conversationComposer/useComposerQueuedMessages'
import { useComposerSender } from './conversationComposer/useComposerSender'
import { useComposerInput } from './conversationComposer/useComposerInput'
import { useComposerSlashCommands } from './conversationComposer/useComposerSlashCommands'
import { useComposerCdPath } from './conversationComposer/useComposerCdPath'
import type { UseConversationComposerOptions } from './conversationComposer/composerHelpers'

export type {
  UseConversationComposerOptions,
  TextSegment,
  UploadImageInput,
  UploadSessionImagesResponse
} from './conversationComposer/composerHelpers'

export function useConversationComposer(options: UseConversationComposerOptions) {
  // 1. 共享脊柱：所有响应式状态 / store / 派生计算 / setup 副作用在此一次性建立。
  const ctx = useComposerShared(options)

  // 2. 各职责子 composable（依赖通过参数显式注入，绝不各自独立创建共享状态）。
  const dropdowns = useComposerDropdowns(ctx)

  const fileMentions = useComposerFileMentions(ctx)

  const attachments = useComposerAttachments(ctx)

  const queuedMessages = useComposerQueuedMessages(ctx, attachments)

  // sender 与 input 互为依赖：sender 先实例化，其 handleSend 通过 inputHandle（lazy）被 input 反向消费。
  const inputHandle: { handleSend: () => Promise<void> } = {
    handleSend: async () => {
      await sender.handleSend()
    }
  }

  const sender = useComposerSender(
    ctx,
    {
      expandComposerMentions: fileMentions.expandComposerMentions,
      closeFileMention: ctx.closeFileMention,
      closeSlashCommand: ctx.closeSlashCommand,
      closeCdPathSuggestions: ctx.closeCdPathSuggestions
    },
    attachments,
    { handleOpenCompress: ctx.handleOpenCompress }
  )

  const input = useComposerInput(ctx, inputHandle)

  const slashCommands = useComposerSlashCommands(ctx, input)
  const cdPath = useComposerCdPath(ctx, input)

  return {
    // ---- dropdowns ----
    agentOptions: ctx.agentOptions,
    currentAgent: ctx.currentAgent,
    currentAgentId: ctx.currentAgentId,
    currentAgentName: ctx.currentAgentName,
    currentProjectPath: ctx.currentProjectPath,
    currentSessionId: ctx.currentSessionId,
    currentWorkingDirectory: ctx.currentWorkingDirectory,
    fileInputRef: ctx.fileInputRef,
    focusInput: ctx.focusInput,
    getModelLabel: dropdowns.getModelLabel,
    handleAttachmentFileChange: attachments.handleAttachmentFileChange,
    handleCdPathSelect: cdPath.handleCdPathSelect,
    handleConfirmCompress: ctx.handleConfirmCompress,
    handleCancelCompress: ctx.handleCancelCompress,
    handleFileSelect: fileMentions.handleFileSelect,
    handleInput: input.handleInput,
    handleCompositionEnd: input.handleCompositionEnd,
    handleCompositionStart: input.handleCompositionStart,
    handleKeyDown: input.handleKeyDown,
    handleMessageFormSubmit: sender.handleMessageFormSubmit,
    handleOpenCompress: ctx.handleOpenCompress,
    handlePaste: attachments.handlePaste,
    retryMessage: sender.retryMessage,
    editAndResendMessage: sender.editAndResendMessage,
    handleSend: sender.handleSend,
    handleSlashCommandSelect: slashCommands.handleSlashCommandSelect,
    inputPlaceholder: ctx.inputPlaceholder,
    inputText: ctx.inputText,
    insertFileMentions: fileMentions.insertFileMentions,
    isAgentDropdownOpen: ctx.isAgentDropdownOpen,
    isCompressing: ctx.isCompressing,
    isModelDropdownOpen: ctx.isModelDropdownOpen,
    isReasoningDropdownOpen: ctx.isReasoningDropdownOpen,
    isSending: ctx.isSending,
    isUploadingImages: ctx.isUploadingImages,
    messageCount: ctx.messageCount,
    openAttachmentPicker: attachments.openAttachmentPicker,
    parsedInputText: input.parsedInputText,
    pendingImages: ctx.pendingImages,
    presetModelOptions: ctx.presetModelOptions,
    modelFilterText: ctx.modelFilterText,
    filteredModelOptions: ctx.filteredModelOptions,
    queuedMessages: ctx.queuedMessages,
    reasoningEffortOptions: ctx.reasoningEffortOptions,
    removeImage: attachments.removeImage,
    removeQueuedMessage: queuedMessages.removeQueuedMessage,
    updateQueuedMessage: queuedMessages.updateQueuedMessage,
    renderLayerRef: ctx.renderLayerRef,
    restorePendingImages: attachments.restorePendingImages,
    retryQueuedMessage: queuedMessages.retryQueuedMessage,
    sendImmediatelyQueuedMessage: queuedMessages.sendImmediatelyQueuedMessage,
    selectedModelId: ctx.selectedModelId,
    selectedReasoningEffort: ctx.selectedReasoningEffort,
    selectAgent: dropdowns.selectAgent,
    selectModel: dropdowns.selectModel,
    selectReasoningEffort: dropdowns.selectReasoningEffort,
    shouldShowCompressButton: ctx.shouldShowCompressButton,
    showCompressionDialog: ctx.showCompressionDialog,
    tokenUsage: ctx.tokenUsage,

    // ---- 面板与坐标（@文件提及 / 斜杠命令 / Cd 路径） ----
    showFileMention: ctx.showFileMention,
    fileMentionPosition: ctx.fileMentionPosition,
    mentionSearchText: ctx.mentionSearchText,
    mentionStart: ctx.mentionStart,
    closeFileMention: ctx.closeFileMention,
    showSlashCommand: ctx.showSlashCommand,
    slashCommandPosition: ctx.slashCommandPosition,
    slashCommandQuery: ctx.slashCommandQuery,
    slashCommands: slashCommands.slashCommands,
    closeSlashCommand: ctx.closeSlashCommand,
    showCdPathSuggestions: ctx.showCdPathSuggestions,
    cdPathPosition: ctx.cdPathPosition,
    cdPathQuery: ctx.cdPathQuery,
    closeCdPathSuggestions: ctx.closeCdPathSuggestions,

    // ---- 下拉 DOM 引用 ----
    agentDropdownRef: ctx.agentDropdownRef,
    modelDropdownRef: ctx.modelDropdownRef,
    reasoningDropdownRef: ctx.reasoningDropdownRef,

    // ---- 下拉开关 ----
    toggleAgentDropdown: dropdowns.toggleAgentDropdown,
    toggleModelDropdown: dropdowns.toggleModelDropdown,
    toggleReasoningDropdown: dropdowns.toggleReasoningDropdown,
    getReasoningEffortLabel: dropdowns.getReasoningEffortLabel,

    // ---- 输入框与渲染层 ----
    textareaRef: ctx.textareaRef,
    syncScroll: ctx.syncScroll,

    // ---- 队列消息预览 ----
    buildQueuedMessagePreview: queuedMessages.buildQueuedMessagePreview,

    // ---- 计划模式 ----
    cancelPlan: sender.cancelPlan,
    executePlan: sender.executePlan,
    executeCurrentPlan: sender.executeCurrentPlan
  }
}
