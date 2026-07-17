<script setup lang="ts">
/** ConversationComposer 组件：会话输入组合器，集成输入、@提及、斜杠命令、Token、压缩与权限等（逻辑见 useConversationComposer.ts） */
import type { ConversationComposerProps, ConversationComposerEmits } from './useConversationComposer'
import { useConversationComposer } from './useConversationComposer'

const props = withDefaults(defineProps<ConversationComposerProps>(), {
  sessionId: null,
  workingDirectory: null,
  setWorkingDirectory: undefined,
  defaultFileMentionScope: 'project',
  compact: false,
  showWorkingDirectory: false,
  hideStatusBar: false,
  activeForm: null
})

const emit = defineEmits<ConversationComposerEmits>()

const {
  EaIcon,
  TokenProgressBar,
  CompressionConfirmDialog,
  ConversationTodoPanel,
  CdPathDropdown,
  ConversationComposerAttachments,
  ConversationComposerRichTextOverlay,
  ActiveFormPopup,
  PermissionPromptPopup,
  FileMentionDropdown,
  SlashCommandDropdown,
  agentDropdownRef,
  agentOptions,
  buildQueuedMessagePreview,
  cancelQueuedMessageEdit,
  cdPathPosition,
  cdPathQuery,
  closeFileMention,
  closeCdPathSuggestions,
  closeSlashCommand,
  composerSendShortcutHint,
  currentAgent,
  currentAgentId,
  currentAgentName,
  currentBranch,
  currentProjectName,
  currentProjectId,
  currentProjectPath,
  currentWorkingDirectory,
  executeCurrentPlan,
  editingQueuedDraftId,
  fileInputRef,
  fileMentionPosition,
  focusInput,
  getModelLabel,
  getReasoningEffortLabel,
  handleCancelCompress,
  handleCdPathSelect,
  handleConfirmCompress,
  handleCompositionEnd,
  handleCompositionStart,
  handleFileSelect,
  handleAttachmentFileChange,
  handleInput,
  handleKeyDown,
  handleMessageFormSubmit,
  handleSend,
  handleOpenCompress,
  handlePaste,
  handleSlashCommandSelect,
  hasPermissionPrompt,
  activeExtensionTab,
  activePromptCard,
  completedTodoCount,
  hasExtensionSlot,
  hasQueuedMessages,
  hasTodoItems,
  todoItemCount,
  inputPlaceholder,
  inputText,
  isAgentDropdownOpen,
  isCompressing,
  isDarkTheme,
  isDragOver,
  isMainPanel,
  isMiniPanel,
  isModelDropdownOpen,
  isPlanMode,
  isPlanMenuOpen,
  planMenuRef,
  isReasoningDropdownOpen,
  isQueueCollapsed,
  isUploadingImages,
  mentionSearchText,
  mentionStart,
  messageCount,
  modelDropdownRef,
  reasoningDropdownRef,
  openAttachmentPicker,
  parsedInputText,
  pendingImages,
  modelFilterText,
  filteredModelOptions,
  reasoningEffortOptions,
  queuedDraftEditText,
  queuedMessages,
  removeImage,
  removeQueuedMessage,
  renderLayerRef,
  retryMessage,
  retryQueuedMessage,
  rootRef,
  saveQueuedMessageEdit,
  sendImmediatelyQueuedMessage,
  selectedModelId,
  selectedReasoningEffort,
  selectAgent,
  selectModel,
  selectReasoningEffort,
  setQueuedDraftEditorRef,
  shouldUseRichTextOverlay,
  showCdPathSuggestions,
  showCompressionDialog,
  showFileMention,
  showSlashCommand,
  slashCommandPosition,
  slashCommandQuery,
  slashCommands,
  startQueuedMessageEdit,
  selectExtensionTab,
  selectPromptCard,
  syncScroll,
  t,
  textareaRef,
  toggleAgentDropdown,
  toggleModelDropdown,
  toggleReasoningDropdown,
  toggleQueueCollapsed,
  togglePlanMenu,
  tokenUsage,
  handleActiveFormSubmit,
  handleActiveFormCancel,
  hasProjects,
  isProjectDropdownOpen,
  projectDropdownRef,
  projectOptions,
  toggleProjectDropdown,
  selectProject,
  isBranchDropdownOpen,
  branchDropdownRef,
  branchList,
  isLoadingBranches,
  toggleBranchDropdown,
  selectBranch,
  isHistoryLoading,
  isStopButtonMode,
  sendButtonDisabled,
  sendButtonTitle,
  closePlanMenu,
  handlePlanExecute,
  handlePlanExit,
  handlePlanMenuFocusOut,
  openPlanMenu
} = useConversationComposer(props, emit)

defineExpose({
  focusInput,
  handleMessageFormSubmit,
  retryMessage,
  openCompressionDialog: handleOpenCompress,
  startPlanExecution: executeCurrentPlan
})
</script>

<template>
  <div
    ref="rootRef"
    class="conversation-composer"
    :data-drag-text="t('message.dropAttachments')"
    :class="{
      'conversation-composer--main': isMainPanel,
      'conversation-composer--mini': isMiniPanel,
      'conversation-composer--compact': compact,
      'conversation-composer--drag-over': isDragOver,
      'conversation-composer--dark': isDarkTheme,
      'conversation-composer--plan-mode': isPlanMode
    }"
  >
    <div
      v-if="!isMainPanel && !hideStatusBar"
      class="conversation-composer__status"
    >
      <div class="conversation-composer__status-left">
        <div
          v-if="queuedMessages.length > 0"
          class="conversation-composer__queue-pill"
        >
          <EaIcon
            name="clock-3"
            :size="12"
          />
          <span>{{ queuedMessages.length }}</span>
        </div>

        <div
          v-if="showWorkingDirectory && currentWorkingDirectory"
          class="conversation-composer__path"
          :title="currentWorkingDirectory"
        >
          <EaIcon
            name="folder-open"
            :size="12"
          />
          <span>{{ currentWorkingDirectory }}</span>
        </div>

        <span
          v-if="currentBranch"
          class="conversation-composer__branch"
          :title="`git: ${currentBranch}`"
        >
          <EaIcon
            name="git-branch"
            :size="12"
          />
          <span>{{ currentBranch }}</span>
        </span>
      </div>

      <div class="conversation-composer__status-right">
        <!-- 模型 / 附件 / 压缩 已统一下沉到底部工具栏 -->

        <div
          ref="agentDropdownRef"
          class="composer-chip composer-chip--dropdown"
          :class="{ 'composer-chip--open': isAgentDropdownOpen }"
        >
          <button
            class="composer-chip__button"
            @click="toggleAgentDropdown"
          >
            <EaIcon
              :name="currentAgent?.provider === 'codex' ? 'terminal' : 'code'"
              :size="12"
            />
            <span>{{ currentAgentName }}</span>
            <EaIcon
              :name="isAgentDropdownOpen ? 'chevron-up' : 'chevron-down'"
              :size="10"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="isAgentDropdownOpen"
              class="composer-chip__menu"
            >
              <div
                v-for="option in agentOptions"
                :key="option.value"
                class="composer-chip__option"
                :class="{ 'composer-chip__option--selected': option.value === currentAgentId }"
                @click="selectAgent(option.value)"
              >
                <EaIcon
                  :name="option.provider === 'codex' ? 'terminal' : 'code'"
                  :size="12"
                />
                <span>{{ option.label }}</span>
                <span class="composer-chip__tag">{{ option.provider ? option.provider.toUpperCase() : 'ACP' }}</span>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="conversation-composer__dock">
      <div
        v-if="isMainPanel && (hasProjects || currentBranch)"
        class="conversation-composer__context-bar"
      >
        <div
          v-if="hasProjects"
          ref="projectDropdownRef"
          class="conversation-composer__ctx-chip conversation-composer__ctx-chip--dropdown"
          :class="{ 'conversation-composer__ctx-chip--open': isProjectDropdownOpen }"
        >
          <button
            class="conversation-composer__ctx-button"
            @click="toggleProjectDropdown"
          >
            <EaIcon
              name="folder-open"
              :size="12"
            />
            <span class="conversation-composer__ctx-label">{{ currentProjectName || t('session.selectProject') }}</span>
            <EaIcon
              :name="isProjectDropdownOpen ? 'chevron-up' : 'chevron-down'"
              :size="10"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="isProjectDropdownOpen"
              class="conversation-composer__ctx-menu"
            >
              <div
                v-for="option in projectOptions"
                :key="option.value"
                class="conversation-composer__ctx-option"
                :class="{ 'conversation-composer__ctx-option--active': option.value === currentProjectId }"
                :title="option.path"
                @click="selectProject(option.value)"
              >
                <EaIcon
                  name="folder"
                  :size="12"
                />
                <span class="conversation-composer__ctx-option-name">{{ option.label }}</span>
              </div>
            </div>
          </Transition>
        </div>

        <div
          v-if="currentBranch"
          ref="branchDropdownRef"
          class="conversation-composer__ctx-chip conversation-composer__ctx-chip--dropdown conversation-composer__ctx-chip--branch"
          :class="{ 'conversation-composer__ctx-chip--open': isBranchDropdownOpen }"
        >
          <button
            class="conversation-composer__ctx-button"
            :title="`git: ${currentBranch}`"
            @click="toggleBranchDropdown"
          >
            <EaIcon
              name="git-branch"
              :size="12"
            />
            <span>{{ currentBranch }}</span>
            <EaIcon
              :name="isBranchDropdownOpen ? 'chevron-up' : 'chevron-down'"
              :size="10"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="isBranchDropdownOpen"
              class="conversation-composer__ctx-menu"
            >
              <div
                v-if="isLoadingBranches"
                class="conversation-composer__ctx-loading"
              >
                {{ t('common.loading') }}
              </div>
              <div
                v-for="branch in branchList"
                v-else
                :key="branch"
                class="conversation-composer__ctx-option"
                :class="{ 'conversation-composer__ctx-option--active': branch === currentBranch }"
                @click="selectBranch(branch)"
              >
                <EaIcon
                  :name="branch === currentBranch ? 'check' : 'git-branch'"
                  :size="12"
                />
                <span class="conversation-composer__ctx-option-name">{{ branch }}</span>
              </div>
            </div>
          </Transition>
        </div>
      </div>
      <div
        v-if="isMainPanel && (hasPermissionPrompt || activeForm || hasExtensionSlot)"
        class="conversation-composer__extension-stage"
      >
        <div
          v-if="hasPermissionPrompt || activeForm"
          class="conversation-composer__floating-prompts"
          :class="{
            'conversation-composer__floating-prompts--stacked': hasPermissionPrompt && activeForm,
            'conversation-composer__floating-prompts--permission-active': hasPermissionPrompt && activeForm && activePromptCard === 'permission'
          }"
        >
          <div
            v-if="activeForm"
            class="conversation-composer__prompt-card"
            :class="{
              'conversation-composer__prompt-card--active': activePromptCard === 'form',
              'conversation-composer__prompt-card--back': activePromptCard !== 'form'
            }"
            :role="activePromptCard !== 'form' ? 'button' : undefined"
            :tabindex="activePromptCard !== 'form' ? 0 : -1"
            @click="selectPromptCard('form')"
            @keydown.enter.prevent="selectPromptCard('form')"
            @keydown.space.prevent="selectPromptCard('form')"
          >
            <ActiveFormPopup
              :question="activeForm.question"
              :form-schema="activeForm.formSchema"
              @submit="handleActiveFormSubmit"
              @cancel="handleActiveFormCancel"
            />
          </div>
          <div
            v-if="sessionId && hasPermissionPrompt && activePromptCard === 'permission'"
            class="conversation-composer__prompt-card conversation-composer__prompt-card--active"
          >
            <PermissionPromptPopup :session-id="sessionId" />
          </div>
          <div
            v-else-if="sessionId && hasPermissionPrompt"
            class="conversation-composer__prompt-card conversation-composer__prompt-card--back"
            role="button"
            tabindex="0"
            @click="selectPromptCard('permission')"
            @keydown.enter.prevent="selectPromptCard('permission')"
            @keydown.space.prevent="selectPromptCard('permission')"
          >
            <PermissionPromptPopup :session-id="sessionId" />
          </div>
        </div>

        <section
          v-if="hasExtensionSlot"
          class="conversation-composer__extension-slot"
        >
          <header class="conversation-composer__extension-head">
            <div
              class="conversation-composer__extension-tabs"
              role="tablist"
            >
              <button
                v-if="hasQueuedMessages"
                type="button"
                role="tab"
                class="conversation-composer__extension-tab"
                :class="{ 'conversation-composer__extension-tab--active': activeExtensionTab === 'queue' }"
                :aria-selected="activeExtensionTab === 'queue'"
                @click="selectExtensionTab('queue')"
              >
                <EaIcon
                  name="clock-3"
                  :size="13"
                />
                <span>{{ t('message.pendingLabel') }}</span>
                <span class="conversation-composer__extension-count">{{ queuedMessages.length }}</span>
              </button>
              <button
                v-if="hasTodoItems"
                type="button"
                role="tab"
                class="conversation-composer__extension-tab"
                :class="{ 'conversation-composer__extension-tab--active': activeExtensionTab === 'todo' }"
                :aria-selected="activeExtensionTab === 'todo'"
                @click="selectExtensionTab('todo')"
              >
                <EaIcon
                  name="list-todo"
                  :size="13"
                />
                <span>{{ t('message.agentPlan.status.pending') }}</span>
                <span class="conversation-composer__extension-count">{{ completedTodoCount }}/{{ todoItemCount }}</span>
              </button>
            </div>
            <button
              type="button"
              class="conversation-composer__extension-collapse"
              :aria-expanded="!isQueueCollapsed"
              @click="toggleQueueCollapsed"
            >
              <EaIcon
                :name="isQueueCollapsed ? 'chevron-down' : 'chevron-up'"
                :size="14"
              />
            </button>
          </header>

          <div
            v-show="!isQueueCollapsed"
            class="conversation-composer__extension-body"
          >
            <div
              v-if="activeExtensionTab === 'queue' && hasQueuedMessages"
              class="conversation-composer__queue conversation-composer__queue--integrated"
            >
              <div
                v-for="(draft, index) in queuedMessages"
                :key="draft.id"
                class="conversation-composer__queue-item"
                :class="{
                  'conversation-composer__queue-item--editing': editingQueuedDraftId === draft.id,
                  'conversation-composer__queue-item--failed': draft.status === 'failed'
                }"
              >
                <div class="conversation-composer__queue-index">
                  {{ index + 1 }}
                </div>
                <div class="conversation-composer__queue-body">
                  <div class="conversation-composer__queue-top">
                    <span>{{ draft.status === 'failed' ? t('message.pendingFailed') : t('message.pendingLabel') }}</span>
                    <span v-if="draft.attachments.length > 0">{{ t('message.queueAttachments', { count: draft.attachments.length }) }}</span>
                  </div>
                  <div
                    class="conversation-composer__queue-preview"
                    :class="{ 'conversation-composer__queue-preview--editing': editingQueuedDraftId === draft.id }"
                  >
                    <textarea
                      v-if="editingQueuedDraftId === draft.id"
                      :ref="(element) => setQueuedDraftEditorRef(draft.id, element)"
                      v-model="queuedDraftEditText"
                      class="conversation-composer__queue-editor"
                      rows="4"
                      placeholder="编辑待发送内容..."
                      @keydown.stop
                    />
                    <template v-else>
                      {{ buildQueuedMessagePreview(draft) || t('message.pendingEmpty') }}
                    </template>
                  </div>
                  <div
                    v-if="draft.status === 'failed' && draft.errorMessage"
                    class="conversation-composer__queue-error"
                  >
                    {{ draft.errorMessage }}
                  </div>
                </div>
                <div class="conversation-composer__queue-actions">
                  <button
                    v-if="editingQueuedDraftId !== draft.id"
                    class="conversation-composer__queue-action"
                    :title="t('message.sendImmediately')"
                    @click="sendImmediatelyQueuedMessage(draft.id)"
                  >
                    <EaIcon
                      name="send"
                      :size="12"
                    />
                  </button>
                  <button
                    v-if="editingQueuedDraftId !== draft.id"
                    class="conversation-composer__queue-action"
                    @click="startQueuedMessageEdit(draft.id, draft.displayContent || draft.content)"
                  >
                    <EaIcon
                      name="pencil"
                      :size="12"
                    />
                  </button>
                  <button
                    v-else
                    class="conversation-composer__queue-action"
                    @click="saveQueuedMessageEdit(draft.id)"
                  >
                    <EaIcon
                      name="check"
                      :size="12"
                    />
                  </button>
                  <button
                    v-if="editingQueuedDraftId === draft.id"
                    class="conversation-composer__queue-action"
                    @click="cancelQueuedMessageEdit"
                  >
                    <EaIcon
                      name="x"
                      :size="12"
                    />
                  </button>
                  <button
                    v-else-if="draft.status === 'failed'"
                    class="conversation-composer__queue-action"
                    @click="retryQueuedMessage(draft.id)"
                  >
                    <EaIcon
                      name="refresh-cw"
                      :size="12"
                    />
                  </button>
                  <button
                    class="conversation-composer__queue-action"
                    @click="removeQueuedMessage(draft.id)"
                  >
                    <EaIcon
                      name="x"
                      :size="12"
                    />
                  </button>
                </div>
              </div>
            </div>

            <ConversationTodoPanel
              v-else-if="sessionId && hasTodoItems"
              :session-id="sessionId"
              :default-collapsed="false"
              embedded
            />
          </div>
        </section>
      </div>

      <div class="conversation-composer__panel">
        <ConversationComposerAttachments
          v-if="isMainPanel"
          :attachments="pendingImages"
          :main="true"
          :remove-attachment="removeImage"
        />

        <input
          ref="fileInputRef"
          type="file"
          class="conversation-composer__file-input"
          multiple
          @change="handleAttachmentFileChange"
        >

        <ConversationComposerAttachments
          v-if="!isMainPanel"
          :attachments="pendingImages"
          :main="false"
          :remove-attachment="removeImage"
        />

        <div class="conversation-composer__editor-stack">
          <div
            class="conversation-composer__editor-shell"
            :class="{ 'conversation-composer__editor-shell--plan-mode': isPlanMode }"
            @contextmenu.prevent
          >
            <div class="conversation-composer__editor-field">
              <div
                ref="renderLayerRef"
                class="conversation-composer__render"
                :class="{
                  'conversation-composer__render--hidden': !shouldUseRichTextOverlay
                }"
              >
                <ConversationComposerRichTextOverlay
                  :t="t"
                  :parsed-input-text="parsedInputText"
                  :should-use-rich-text-overlay="shouldUseRichTextOverlay"
                  :is-main-panel="isMainPanel"
                  :input-text="inputText"
                  :composer-send-shortcut-hint="composerSendShortcutHint"
                />
              </div>

              <textarea
                ref="textareaRef"
                v-model="inputText"
                class="conversation-composer__textarea"
                :class="{
                  'conversation-composer__textarea--overlay': shouldUseRichTextOverlay
                }"
                rows="2"
                :disabled="!sessionId || isHistoryLoading"
                :placeholder="shouldUseRichTextOverlay ? '' : (isHistoryLoading ? t('message.loadingSession') : (inputPlaceholder || t('message.inputPlaceholder', { shortcut: t('message.shortcutEnter') })))"
                @compositionstart="handleCompositionStart"
                @compositionend="handleCompositionEnd"
                @input="handleInput"
                @keydown="handleKeyDown"
                @paste="handlePaste"
                @scroll="syncScroll"
                @focus="emit('focus')"
              />
            </div>

            <div
              v-if="isMainPanel"
              class="conversation-composer__control-row"
            >
              <div class="conversation-composer__control-group conversation-composer__control-group--start">
                <button
                  class="composer-chip composer-chip--image composer-chip--image-main"
                  :disabled="isUploadingImages"
                  @click="openAttachmentPicker"
                >
                  <EaIcon
                    name="plus"
                    :size="14"
                  />
                </button>

                <div
                  ref="agentDropdownRef"
                  class="composer-chip composer-chip--dropdown"
                  :class="{
                    'composer-chip--main': isMainPanel,
                    'composer-chip--open': isAgentDropdownOpen
                  }"
                >
                  <button
                    class="composer-chip__button"
                    @click="toggleAgentDropdown"
                  >
                    <EaIcon
                      :name="currentAgent?.provider === 'codex' ? 'terminal' : 'code'"
                      :size="11"
                    />
                    <span>{{ currentAgentName }}</span>
                    <EaIcon
                      :name="isAgentDropdownOpen ? 'chevron-up' : 'chevron-down'"
                      :size="9"
                    />
                  </button>
                  <Transition name="dropdown">
                    <div
                      v-if="isAgentDropdownOpen"
                      class="composer-chip__menu"
                    >
                      <div
                        v-for="option in agentOptions"
                        :key="option.value"
                        class="composer-chip__option"
                        :class="{ 'composer-chip__option--selected': option.value === currentAgentId }"
                        @click="selectAgent(option.value)"
                      >
                        <EaIcon
                          :name="option.provider === 'codex' ? 'terminal' : 'code'"
                          :size="12"
                        />
                        <span>{{ option.label }}</span>
                        <span class="composer-chip__tag">{{ option.provider ? option.provider.toUpperCase() : 'ACP' }}</span>
                      </div>
                    </div>
                  </Transition>
                </div>

                <div
                  v-if="isPlanMode"
                  ref="planMenuRef"
                  class="composer-chip composer-chip--dropdown conversation-composer__plan-chip"
                  :class="{ 'composer-chip--open': isPlanMenuOpen }"
                  @mouseenter="openPlanMenu"
                  @mouseleave="closePlanMenu"
                  @focusout="handlePlanMenuFocusOut"
                  @keydown.esc.stop="closePlanMenu"
                >
                  <button
                    type="button"
                    class="composer-chip__button"
                    :aria-expanded="isPlanMenuOpen"
                    @click="togglePlanMenu"
                    @focus="openPlanMenu"
                  >
                    <EaIcon
                      name="eye"
                      :size="11"
                    />
                    <span>{{ t('message.agentPlan.toggle') }}</span>
                    <EaIcon
                      :name="isPlanMenuOpen ? 'chevron-up' : 'chevron-down'"
                      :size="9"
                    />
                  </button>
                  <Transition name="dropdown">
                    <div
                      v-if="isPlanMenuOpen"
                      class="composer-chip__menu conversation-composer__plan-menu"
                    >
                      <button
                        type="button"
                        class="conversation-composer__plan-menu-action"
                        @click="handlePlanExit"
                      >
                        <EaIcon
                          name="x"
                          :size="12"
                        />
                        <span>{{ t('message.planModeBanner.cancel') }}</span>
                      </button>
                      <button
                        type="button"
                        class="conversation-composer__plan-menu-action conversation-composer__plan-menu-action--primary"
                        @click="handlePlanExecute"
                      >
                        <EaIcon
                          name="play"
                          :size="12"
                        />
                        <span>{{ t('message.planModeBanner.execute') }}</span>
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>

              <div class="conversation-composer__control-group conversation-composer__control-group--end">
                <div class="conversation-composer__context-slot">
                  <TokenProgressBar
                    :session-id="sessionId"
                    @compress="handleOpenCompress"
                  />
                </div>

                <div
                  v-if="currentAgent"
                  ref="modelDropdownRef"
                  class="composer-chip composer-chip--dropdown"
                  :class="{
                    'composer-chip--main': isMainPanel,
                    'composer-chip--open': isModelDropdownOpen
                  }"
                >
                  <button
                    class="composer-chip__button"
                    @click="toggleModelDropdown"
                  >
                    <EaIcon
                      name="cpu"
                      :size="11"
                    />
                    <span class="composer-chip__text">{{ getModelLabel(selectedModelId) }}</span>
                    <EaIcon
                      :name="isModelDropdownOpen ? 'chevron-up' : 'chevron-down'"
                      :size="9"
                    />
                  </button>
                  <Transition name="dropdown">
                    <div
                      v-if="isModelDropdownOpen"
                      class="composer-chip__menu composer-chip__menu--right"
                    >
                      <div class="composer-chip__search">
                        <input
                          v-model="modelFilterText"
                          type="text"
                          class="composer-chip__search-input"
                          :placeholder="t('composer.searchModelPlaceholder')"
                          @click.stop
                        >
                      </div>
                      <div
                        v-for="model in filteredModelOptions"
                        :key="model.value"
                        class="composer-chip__option"
                        :class="{ 'composer-chip__option--selected': model.value === selectedModelId }"
                        @click="selectModel(model.value)"
                      >
                        {{ model.label }}
                      </div>
                      <div
                        v-if="filteredModelOptions.length === 0"
                        class="composer-chip__empty"
                      >
                        {{ t('composer.noModelMatch') }}
                      </div>
                    </div>
                  </Transition>
                </div>

                <div
                  v-if="currentAgent && reasoningEffortOptions.length > 0"
                  ref="reasoningDropdownRef"
                  class="composer-chip composer-chip--dropdown"
                  :class="{
                    'composer-chip--main': isMainPanel,
                    'composer-chip--open': isReasoningDropdownOpen
                  }"
                >
                  <button
                    class="composer-chip__button"
                    @click="toggleReasoningDropdown"
                  >
                    <EaIcon
                      name="brain"
                      :size="11"
                    />
                    <span>{{ getReasoningEffortLabel(selectedReasoningEffort) }}</span>
                    <EaIcon
                      :name="isReasoningDropdownOpen ? 'chevron-up' : 'chevron-down'"
                      :size="9"
                    />
                  </button>
                  <Transition name="dropdown">
                    <div
                      v-if="isReasoningDropdownOpen"
                      class="composer-chip__menu composer-chip__menu--right"
                    >
                      <div
                        class="composer-chip__option composer-chip__option--reset"
                        :class="{ 'composer-chip__option--selected': !selectedReasoningEffort }"
                        @click.stop="selectReasoningEffort('')"
                      >
                        {{ t('reasoning.default') }}
                      </div>
                      <div
                        v-for="option in reasoningEffortOptions"
                        :key="option.value"
                        class="composer-chip__option"
                        :class="{ 'composer-chip__option--selected': option.value === selectedReasoningEffort }"
                        @click.stop="selectReasoningEffort(option.value)"
                      >
                        {{ option.label }}
                      </div>
                    </div>
                  </Transition>
                </div>

                <button
                  type="button"
                  class="conversation-composer__send conversation-composer__send--main"
                  :class="{ 'conversation-composer__send--stop': isStopButtonMode }"
                  :disabled="sendButtonDisabled"
                  :title="sendButtonTitle"
                  :aria-label="sendButtonTitle"
                  @click="handleSend"
                >
                  <span
                    v-if="queuedMessages.length > 0"
                    class="conversation-composer__send-state"
                  >
                    {{ queuedMessages.length }}
                  </span>
                  <EaIcon
                    :name="isStopButtonMode ? 'square' : 'send-horizontal'"
                    :size="14"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="!isMainPanel"
          class="conversation-composer__main-footer"
        >
          <div class="conversation-composer__main-footer-left">
            <button
              class="composer-chip composer-chip--image"
              :disabled="isUploadingImages"
              @click="openAttachmentPicker"
            >
              <EaIcon
                name="plus"
                :size="14"
              />
            </button>

            <div
              v-if="currentAgent"
              ref="modelDropdownRef"
              class="composer-chip composer-chip--dropdown"
              :class="{
                'composer-chip--open': isModelDropdownOpen
              }"
            >
              <button
                class="composer-chip__button"
                @click="toggleModelDropdown"
              >
                <EaIcon
                  name="cpu"
                  :size="11"
                />
                <span class="composer-chip__text">{{ getModelLabel(selectedModelId) }}</span>
                <EaIcon
                  :name="isModelDropdownOpen ? 'chevron-up' : 'chevron-down'"
                  :size="9"
                />
              </button>
              <Transition name="dropdown">
                <div
                  v-if="isModelDropdownOpen"
                  class="composer-chip__menu"
                >
                  <div class="composer-chip__search">
                    <input
                      v-model="modelFilterText"
                      type="text"
                      class="composer-chip__search-input"
                      :placeholder="t('composer.searchModelPlaceholder')"
                      @click.stop
                    >
                  </div>
                  <div
                    v-for="model in filteredModelOptions"
                    :key="model.value"
                    class="composer-chip__option"
                    :class="{ 'composer-chip__option--selected': model.value === selectedModelId }"
                    @click="selectModel(model.value)"
                  >
                    {{ model.label }}
                  </div>
                  <div
                    v-if="filteredModelOptions.length === 0"
                    class="composer-chip__empty"
                  >
                    {{ t('composer.noModelMatch') }}
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <TokenProgressBar
            :session-id="sessionId"
            @compress="handleOpenCompress"
          />
        </div>
      </div>
    </div>

    <CompressionConfirmDialog
      v-model:visible="showCompressionDialog"
      :token-usage="tokenUsage"
      :message-count="messageCount"
      :loading="isCompressing"
      @confirm="handleConfirmCompress"
      @cancel="handleCancelCompress"
    />

    <FileMentionDropdown
      :visible="showFileMention"
      :position="fileMentionPosition"
      :search-text="mentionSearchText"
      :mention-start="mentionStart"
      :project-path="workingDirectory || currentProjectPath || undefined"
      :default-scope="defaultFileMentionScope"
      :pending-images="pendingImages"
      @select="handleFileSelect"
      @close="closeFileMention"
    />

    <SlashCommandDropdown
      :visible="showSlashCommand"
      :position="slashCommandPosition"
      :query="slashCommandQuery"
      :commands="slashCommands"
      :panel-type="panelType"
      @select="handleSlashCommandSelect"
      @close="closeSlashCommand"
    />

    <CdPathDropdown
      :visible="showCdPathSuggestions"
      :position="cdPathPosition"
      :query="cdPathQuery"
      :current-directory="currentWorkingDirectory"
      @select="handleCdPathSelect"
      @close="closeCdPathSuggestions"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>
