<script setup lang="ts">
import { computed } from 'vue'
import { EaIcon } from '@/components/common'
import TokenProgressBar from '@/components/common/TokenProgressBar.vue'
import CompressionConfirmDialog from '@/components/common/CompressionConfirmDialog.vue'
import { ConversationTodoPanel } from '@/components/message'
import type { ConversationComposerProps } from './useConversationComposerView'
import { useConversationComposerView } from './useConversationComposerView'
import CdPathDropdown from './CdPathDropdown.vue'
import ConversationComposerAttachments from './ConversationComposerAttachments.vue'
import ConversationComposerMemoryAssist from './ConversationComposerMemoryAssist.vue'
import ConversationComposerRichTextOverlay from './ConversationComposerRichTextOverlay.vue'
import ActiveFormPopup from './ActiveFormPopup.vue'
import PermissionPromptPopup from './PermissionPromptPopup.vue'
import FileMentionDropdown from './FileMentionDropdown.vue'
import SlashCommandDropdown from './SlashCommandDropdown.vue'

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

const emit = defineEmits<{
  (e: 'focus'): void
  (e: 'form-submit', values: Record<string, unknown>): void
  (e: 'form-cancel'): void
}>()

function handleActiveFormSubmit(values: Record<string, unknown>) {
  emit('form-submit', values)
}

function handleActiveFormCancel() {
  emit('form-cancel')
}

const {
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
  currentMemoryPreview,
  currentMemoryReferences,
  currentProjectPath,
  currentWorkingDirectory,
  clearMemoryPreview,
  dismissMemorySuggestion,
  executePlan,
  cancelPlan,
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
  handleMemorySuggestionPointerEnter,
  handleMemorySuggestionPointerLeave,
  handleMemoryPreviewPointerEnter,
  handleMemoryPreviewPointerLeave,
  handleOpenCompress,
  handlePaste,
  hasVisibleMemorySuggestions,
  insertMemoryReference,
  handleSlashCommandSelect,
  inputPlaceholder,
  inputText,
  isActiveMemorySuggestion,
  isAgentDropdownOpen,
  isCompressing,
  isDarkTheme,
  isDragOver,
  isMainPanel,
  isMemorySuggestionLoading,
  isMiniPanel,
  isModelDropdownOpen,
  isPlanMode,
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
  previewMemoryReference,
  previewMemorySuggestion,
  scheduleClearMemoryPreview,
  presetModelOptions,
  reasoningEffortOptions,
  queuedDraftEditText,
  queuedMessages,
  removeImage,
  removeMemoryReferenceFromDraft,
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
  shouldShowMemorySuggestionEmptyState,
  shouldShowMemorySuggestionIdleHint,
  shouldShowMemorySuggestions,
  shouldUseRichTextOverlay,
  showCdPathSuggestions,
  showCompressionDialog,
  showFileMention,
  showSlashCommand,
  slashCommandPosition,
  slashCommandQuery,
  slashCommands,
  startQueuedMessageEdit,
  syncScroll,
  t,
  textareaRef,
  toggleAgentDropdown,
  toggleModelDropdown,
  toggleReasoningDropdown,
  toggleQueueCollapsed,
  tokenUsage,
  visibleMemorySuggestions
} = useConversationComposerView(props)

defineExpose({
  focusInput,
  handleMessageFormSubmit,
  retryMessage,
  openCompressionDialog: handleOpenCompress
})

const hasDraftContent = computed(() => (
  inputText.value.trim().length > 0
  || pendingImages.value.length > 0
  || currentMemoryReferences.value.length > 0
))

const sendButtonDisabled = computed(() => (
  !props.sessionId
  || isUploadingImages.value
  || !hasDraftContent.value
))

const sendButtonTitle = computed(() => {
  if (!props.sessionId) {
    return t('message.noSessionSelected')
  }

  if (isUploadingImages.value) {
    return t('message.uploadingAttachments')
  }

  return '发送'
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
      v-if="hideStatusBar && showWorkingDirectory && currentWorkingDirectory"
      class="conversation-composer__path-row"
    >
      <div
        class="conversation-composer__path"
        :title="currentWorkingDirectory"
      >
        <EaIcon
          name="folder-open"
          :size="12"
        />
        <span>{{ currentWorkingDirectory }}</span>
      </div>
    </div>

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

    <div class="conversation-composer__panel">
      <ConversationTodoPanel
        v-if="sessionId"
        :session-id="sessionId"
        :default-collapsed="true"
      />

      <div
        v-if="queuedMessages.length > 0"
        class="conversation-composer__queue"
      >
        <button
          v-if="isMainPanel"
          type="button"
          class="conversation-composer__queue-head"
          :aria-expanded="!isQueueCollapsed"
          @click="toggleQueueCollapsed"
        >
          <span class="conversation-composer__queue-head-title">
            <EaIcon
              name="clock-3"
              :size="13"
            />
            <span>{{ t('message.queueCount', { count: queuedMessages.length }) }}</span>
          </span>
          <EaIcon
            :name="isQueueCollapsed ? 'chevron-down' : 'chevron-up'"
            :size="14"
          />
        </button>

        <div
          v-for="(draft, index) in queuedMessages"
          v-show="!isMainPanel || !isQueueCollapsed"
          :key="draft.id"
          class="conversation-composer__queue-item"
          :class="{ 'conversation-composer__queue-item--editing': editingQueuedDraftId === draft.id }"
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

      <ConversationComposerAttachments
        v-if="isMainPanel"
        :attachments="pendingImages"
        :main="true"
        :remove-attachment="removeImage"
      />

      <ConversationComposerMemoryAssist
        :t="t"
        :is-main-panel="isMainPanel"
        :current-memory-references="currentMemoryReferences"
        :current-memory-preview="currentMemoryPreview"
        :should-show-memory-suggestions="shouldShowMemorySuggestions"
        :has-visible-memory-suggestions="hasVisibleMemorySuggestions"
        :is-memory-suggestion-loading="isMemorySuggestionLoading"
        :should-show-memory-suggestion-empty-state="shouldShowMemorySuggestionEmptyState"
        :should-show-memory-suggestion-idle-hint="shouldShowMemorySuggestionIdleHint"
        :visible-memory-suggestions="visibleMemorySuggestions"
        :is-active-memory-suggestion="isActiveMemorySuggestion"
        :preview-memory-reference="previewMemoryReference"
        :preview-memory-suggestion="previewMemorySuggestion"
        :clear-memory-preview="clearMemoryPreview"
        :schedule-clear-memory-preview="scheduleClearMemoryPreview"
        :handle-memory-preview-pointer-enter="handleMemoryPreviewPointerEnter"
        :handle-memory-preview-pointer-leave="handleMemoryPreviewPointerLeave"
        :handle-memory-suggestion-pointer-enter="handleMemorySuggestionPointerEnter"
        :handle-memory-suggestion-pointer-leave="handleMemorySuggestionPointerLeave"
        :dismiss-memory-suggestion="dismissMemorySuggestion"
        :insert-memory-reference="insertMemoryReference"
        :remove-memory-reference-from-draft="removeMemoryReferenceFromDraft"
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

      <ActiveFormPopup
        v-if="isMainPanel && activeForm"
        :question="activeForm.question"
        :form-schema="activeForm.formSchema"
        @submit="handleActiveFormSubmit"
        @cancel="handleActiveFormCancel"
      />

      <PermissionPromptPopup
        v-if="isMainPanel && sessionId"
        :session-id="sessionId"
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
              rows="4"
              :disabled="!sessionId"
              :placeholder="shouldUseRichTextOverlay ? '' : (inputPlaceholder || t('message.inputPlaceholder', { shortcut: t('message.shortcutEnter') }))"
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
            v-if="isPlanMode"
            class="conversation-composer__plan-footer"
          >
            <div class="conversation-composer__plan-footer-info">
              <EaIcon
                name="eye"
                :size="13"
                class="conversation-composer__plan-footer-icon"
              />
              <span class="conversation-composer__plan-footer-label">{{ t('message.planModeBanner.title') }}</span>
              <span class="conversation-composer__plan-footer-hint">{{ t('message.planModeBanner.hint') }}</span>
            </div>
            <div class="conversation-composer__plan-footer-actions">
              <button
                type="button"
                class="conversation-composer__plan-btn conversation-composer__plan-btn--cancel"
                @click="cancelPlan"
              >
                <EaIcon
                  name="x"
                  :size="12"
                />
                <span>{{ t('message.planModeBanner.cancel') }}</span>
              </button>
              <button
                type="button"
                class="conversation-composer__plan-btn conversation-composer__plan-btn--execute"
                @click="executePlan"
              >
                <EaIcon
                  name="play"
                  :size="12"
                />
                <span>{{ t('message.planModeBanner.execute') }}</span>
              </button>
            </div>
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
                    <div
                      v-for="model in presetModelOptions"
                      :key="model.value"
                      class="composer-chip__option"
                      :class="{ 'composer-chip__option--selected': model.value === selectedModelId }"
                      @click="selectModel(model.value)"
                    >
                      {{ model.label }}
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
                <div
                  v-for="model in presetModelOptions"
                  :key="model.value"
                  class="composer-chip__option"
                  :class="{ 'composer-chip__option--selected': model.value === selectedModelId }"
                  @click="selectModel(model.value)"
                >
                  {{ model.label }}
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
