<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { MessageList } from '@/components/message'
import ConversationComposer from '../conversationComposer/ConversationComposer.vue'
import PaneTabBar from './PaneTabBar.vue'
import { useMessageStore } from '@/stores/message'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useSplitPaneStore } from '@/stores/splitPane'
import type { Message } from '@/stores/message'
import type { ComponentPublicInstance } from 'vue'

const props = defineProps<{
  paneId: string
}>()

const emit = defineEmits<{
  close: [paneId: string]
  dragstart: [paneId: string]
}>()

const { t } = useI18n()
const splitPaneStore = useSplitPaneStore()
const messageStore = useMessageStore()
const sessionExecutionStore = useSessionExecutionStore()

type ComposerExposed = ComponentPublicInstance & {
  focusInput: () => void
  handleMessageFormSubmit: (
    formId: string,
    values: Record<string, unknown>,
    assistantMessageId?: string
  ) => Promise<void>
  retryMessage: (
    messageId: string,
    content: string,
    attachments?: Message['attachments'],
    replaceMessageId?: string
  ) => Promise<boolean>
}

const composerRef = ref<ComposerExposed | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)
const paneWidth = ref(800)
const paneHeight = ref(800)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (wrapperRef.value) {
    paneWidth.value = wrapperRef.value.clientWidth
    paneHeight.value = wrapperRef.value.clientHeight
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        paneWidth.value = entry.contentRect.width
        paneHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(wrapperRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

const isFocused = computed(() => splitPaneStore.focusedPaneId === props.paneId)
const canClose = computed(() => splitPaneStore.paneCount > 1)

// pane 当前活动会话（多 tab 模型）
const pane = computed(() => splitPaneStore.getPaneById(props.paneId))
const activeSessionId = computed(() => pane.value?.activeSessionId ?? '')

const isCompactMode = computed(() => paneWidth.value < 500)
const isMiniMode = computed(() => paneWidth.value < 360)
const isHeightCompact = computed(() => paneHeight.value < 650)
const isHeightMini = computed(() => paneHeight.value < 450)

const isSending = computed(() =>
  sessionExecutionStore.getIsSending(activeSessionId.value)
)

function handleFocus() {
  splitPaneStore.focusPane(props.paneId)
}

function handleClose() {
  emit('close', props.paneId)
}

// tab 栏 grip 触发的整 pane 重排
function onTabBarDragStart(paneId: string) {
  emit('dragstart', paneId)
}

function handleComposerFocus() {
  splitPaneStore.focusPane(props.paneId)
}

async function handleRetry(message: Message) {
  if (isSending.value) return

  const retry = async (targetMessage: Message, replaceMessageId?: string) => {
    await composerRef.value?.retryMessage(
      targetMessage.id,
      targetMessage.content,
      targetMessage.attachments ?? [],
      replaceMessageId
    )
  }

  if (message.role === 'user') {
    await retry(message)
    return
  }

  if (message.role === 'assistant') {
    const messages = messageStore.messagesBySession(activeSessionId.value)
    const messageIndex = messages.findIndex(m => m.id === message.id)
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        await retry(messages[i], message.id)
        return
      }
    }
  }
}

async function handleMessageFormSubmit(
  formId: string,
  values: Record<string, unknown>,
  assistantMessageId?: string
) {
  await composerRef.value?.handleMessageFormSubmit(formId, values, assistantMessageId)
}
</script>

<template>
  <div
    ref="wrapperRef"
    :class="[
      'pane-wrapper',
      {
        'pane-wrapper--focused': isFocused,
        'pane-wrapper--compact': isCompactMode,
        'pane-wrapper--mini': isMiniMode,
        'pane-wrapper--h-compact': isHeightCompact,
        'pane-wrapper--h-mini': isHeightMini
      }
    ]"
  >
    <div class="pane-wrapper__header">
      <PaneTabBar
        :pane-id="paneId"
        :is-focused="isFocused"
        :is-mini="isMiniMode || isHeightMini"
        @focus="handleFocus"
        @dragstart="onTabBarDragStart"
      />
      <div
        v-if="canClose"
        class="pane-wrapper__header-close-wrap"
      >
        <button
          class="pane-header__close"
          :title="t('splitPane.closePane')"
          @click.stop="handleClose"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>
    </div>

    <div class="pane-wrapper__content">
      <MessageList
        class="pane-wrapper__list"
        :session-id="activeSessionId"
        :top-safe-inset="0"
        @retry="handleRetry"
        @form-submit="handleMessageFormSubmit"
      />

      <ConversationComposer
        ref="composerRef"
        :session-id="activeSessionId"
        :panel-type="isMiniMode ? 'mini' : 'main'"
        :compact="isCompactMode"
        @focus="handleComposerFocus"
      />
    </div>
  </div>
</template>

<style scoped>
.pane-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-bg-primary);
  position: relative;
  min-width: 0;
}

.pane-wrapper--focused {
  background: var(--color-bg-primary);
}

/* 头部：tab 栏 + 关闭按钮 */
.pane-wrapper__header {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  user-select: none;
}

.pane-wrapper--focused .pane-wrapper__header {
  border-bottom-color: var(--color-primary);
}

/* tab 栏占据剩余空间 */
.pane-wrapper__header > :first-child {
  flex: 1;
  min-width: 0;
}

.pane-wrapper__header-close-wrap {
  display: flex;
  align-items: center;
  padding-right: 6px;
  flex-shrink: 0;
}

.pane-header__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast) var(--easing-default);
}

.pane-wrapper__header:hover .pane-header__close {
  opacity: 1;
}

.pane-header__close:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.pane-wrapper__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.pane-wrapper__list {
  flex: 1;
  min-height: 0;
}

.pane-wrapper--compact .pane-wrapper__content {
  gap: 0;
}

.pane-wrapper--compact :deep(.conversation-composer__main-header) {
  gap: 4px;
  padding-bottom: 4px;
}

.pane-wrapper--compact :deep(.conversation-composer__main-header-left) {
  gap: 3px;
}

.pane-wrapper--compact :deep(.composer-chip--main) {
  min-height: 24px;
}

.pane-wrapper--compact :deep(.composer-chip--main .composer-chip__button) {
  min-height: 24px;
  padding: 0 6px;
  gap: 3px;
  font-size: 11px;
}

.pane-wrapper--compact :deep(.composer-chip--main .composer-chip__button > span:last-child:not(svg span)) {
  display: none;
}

.pane-wrapper--compact :deep(.composer-chip--image span) {
  display: none;
}

.pane-wrapper--compact :deep(.conversation-composer--main .conversation-composer__editor-shell) {
  --conversation-composer-main-max-lines: 4;
  border-radius: 8px;
}

.pane-wrapper--mini .pane-wrapper__content {
  gap: 0;
}

.pane-wrapper--mini :deep(.conversation-composer) {
  padding: 6px 8px;
  gap: 0;
}

.pane-wrapper--mini :deep(.conversation-composer__main-header) {
  gap: 2px;
  padding-bottom: 2px;
}

.pane-wrapper--mini :deep(.conversation-composer__main-header-left) {
  gap: 2px;
}

.pane-wrapper--mini :deep(.composer-chip--main) {
  min-height: 22px;
}

.pane-wrapper--mini :deep(.composer-chip--main .composer-chip__button) {
  min-height: 22px;
  padding: 0 5px;
  gap: 2px;
  font-size: 10px;
}

.pane-wrapper--mini :deep(.composer-chip--main .composer-chip__button > span:last-child:not(svg span)) {
  display: none;
}

.pane-wrapper--mini :deep(.composer-chip--image span) {
  display: none;
}

.pane-wrapper--mini :deep(.conversation-composer--main .conversation-composer__editor-shell) {
  --conversation-composer-main-max-lines: 3;
  --conversation-composer-main-padding-y: 8px;
  --conversation-composer-main-padding-x: 10px;
  border-radius: 6px;
}

.pane-wrapper--mini :deep(.conversation-composer--main .conversation-composer__textarea) {
  font-size: 12px;
}

.pane-wrapper--mini :deep(.conversation-composer__ghost-hints) {
  display: none;
}

/* Height-compact: panes shorter than 550px (typical 2-row layout) */
/* tab 栏高度由 PaneTabBar 的 is-mini 控制，这里只调整内容区 */

.pane-wrapper--h-compact :deep(.conversation-composer) {
  padding: 4px 8px;
  gap: 2px;
}

.pane-wrapper--h-compact :deep(.conversation-composer__main-header) {
  gap: 3px;
  padding-bottom: 2px;
}

.pane-wrapper--h-compact :deep(.composer-chip--main) {
  min-height: 22px;
}

.pane-wrapper--h-compact :deep(.composer-chip--main .composer-chip__button) {
  min-height: 22px;
  padding: 0 5px;
  gap: 2px;
  font-size: 11px;
}

.pane-wrapper--h-compact :deep(.composer-chip--main .composer-chip__button > span:last-child:not(svg span)) {
  display: none;
}

.pane-wrapper--h-compact :deep(.conversation-composer--main .conversation-composer__editor-shell) {
  --conversation-composer-main-max-lines: 3;
  --conversation-composer-main-padding-y: 6px;
  border-radius: 6px;
}

.pane-wrapper--h-compact :deep(.message-bubble) {
  margin-bottom: 6px;
}

.pane-wrapper--h-compact :deep(.message-bubble__avatar) {
  width: 24px;
  height: 24px;
}

.pane-wrapper--h-compact :deep(.message-bubble__avatar img) {
  width: 24px;
  height: 24px;
}

/* Height-mini: panes shorter than 400px (3-row or very cramped) */
/* tab 栏在极矮模式下由 PaneTabBar is-mini 简化 */

.pane-wrapper--h-mini :deep(.conversation-composer) {
  padding: 2px 6px;
  gap: 0;
}

.pane-wrapper--h-mini :deep(.conversation-composer__main-header) {
  gap: 2px;
  padding-bottom: 1px;
}

.pane-wrapper--h-mini :deep(.composer-chip--main) {
  min-height: 20px;
}

.pane-wrapper--h-mini :deep(.composer-chip--main .composer-chip__button) {
  min-height: 20px;
  padding: 0 4px;
  font-size: 10px;
}

.pane-wrapper--h-mini :deep(.conversation-composer--main .conversation-composer__editor-shell) {
  --conversation-composer-main-max-lines: 2;
  --conversation-composer-main-padding-y: 4px;
  --conversation-composer-main-padding-x: 8px;
  border-radius: 4px;
}

.pane-wrapper--h-mini :deep(.conversation-composer--main .conversation-composer__textarea) {
  font-size: 12px;
  line-height: 1.4;
}

.pane-wrapper--h-mini :deep(.conversation-composer__ghost-hints) {
  display: none;
}

.pane-wrapper--h-mini :deep(.message-bubble) {
  margin-bottom: 4px;
}

.pane-wrapper--h-mini :deep(.message-bubble__avatar) {
  width: 20px;
  height: 20px;
}

.pane-wrapper--h-mini :deep(.message-bubble__avatar img) {
  width: 20px;
  height: 20px;
}

.pane-wrapper--h-mini :deep(.message-bubble__meta) {
  margin-bottom: 0;
}
</style>
