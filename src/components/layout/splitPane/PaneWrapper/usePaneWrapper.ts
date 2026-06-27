import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { MessageList } from '@/components/message'
import ConversationComposer from '../../conversationComposer/ConversationComposer.vue'
import PaneTabBar from '../PaneTabBar/PaneTabBar.vue'
import { useMessageStore } from '@/stores/message'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useSplitPaneStore } from '@/stores/splitPane'
import type { Message } from '@/stores/message'
import type { ComponentPublicInstance } from 'vue'

export interface PaneWrapperProps {
  paneId: string
}

export interface PaneWrapperEmits {
  (event: 'close', paneId: string): void
  (event: 'dragstart', paneId: string): void
}

export function usePaneWrapper(props: PaneWrapperProps, emit: PaneWrapperEmits) {

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
      targetMessage.content ?? '',
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

  return {
    t,
    EaIcon,
    MessageList,
    ConversationComposer,
    PaneTabBar,
    composerRef,
    wrapperRef,
    isFocused,
    canClose,
    pane,
    activeSessionId,
    isCompactMode,
    isMiniMode,
    isHeightCompact,
    isHeightMini,
    handleFocus,
    handleClose,
    onTabBarDragStart,
    handleComposerFocus,
    handleRetry,
    handleMessageFormSubmit,
  }
}
