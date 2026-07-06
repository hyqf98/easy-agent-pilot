/**
 * useMiniPanelView — 迷你悬浮面板（mini panel）页面的全部业务逻辑。
 *
 * 职责：
 * 1. 初始化 mini panel 会话上下文（miniPanelStore.initSessionContext）；
 * 2. 维护 ConversationComposer 的 ref，用于聚焦输入框与打开压缩对话框；
 * 3. 监听全局 Escape 键隐藏面板，监听 mini-panel:focus-input 事件聚焦输入框；
 * 4. 处理消息重试：用户消息回填到输入框（含附件预览），助手消息回溯到上一条用户消息；
 * 5. 通过 invoke('hide_mini_panel') 控制面板显隐。
 */
import { onMounted, onUnmounted, ref, type ComponentPublicInstance } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { MessageList } from '@/components/message'
import ConversationComposer from '@/components/layout/conversationComposer/ConversationComposer.vue'
import { useMessageStore, type Message, type MessageAttachment } from '@/stores/message'
import { useMiniPanelStore } from '@/stores/miniPanel'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { resolveAttachmentPreviewUrl } from '@/utils/attachmentPreview'

/** ConversationComposer 对外暴露的方法（聚焦输入框 / 打开压缩对话框） */
type ComposerExposed = ComponentPublicInstance & {
  focusInput: () => void
  openCompressionDialog: () => void
}

/**
 * MiniPanelView 组件的 composable。
 * 该组件为顶层路由页，无 props / emits。
 */
export function useMiniPanelView() {
  const miniPanelStore = useMiniPanelStore()
  const messageStore = useMessageStore()
  const sessionExecutionStore = useSessionExecutionStore()

  const composerRef = ref<ComposerExposed | null>(null)
  let unlistenFocus: (() => void) | null = null

  async function toPendingImages(attachments: MessageAttachment[]) {
    return Promise.all(attachments.map(async attachment => ({
      ...attachment,
      previewUrl: await resolveAttachmentPreviewUrl(attachment)
    })))
  }

  async function hideMiniPanel() {
    await invoke('hide_mini_panel')
  }

  function handleEscapeKey(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return
    }

    event.preventDefault()
    void hideMiniPanel()
  }

  async function handleRetry(message: Message) {
    const sessionId = miniPanelStore.sessionId
    const isSending = sessionId ? sessionExecutionStore.getIsSending(sessionId) : false
    if (!sessionId || isSending) {
      return
    }

    if (message.role === 'user') {
      sessionExecutionStore.setInputText(sessionId, message.content ?? '')
      sessionExecutionStore.setPendingImages(sessionId, await toPendingImages(message.attachments ?? []))
      composerRef.value?.focusInput()
      return
    }

    if (message.role === 'assistant') {
      const messages = messageStore.messagesBySession(sessionId)
      const messageIndex = messages.findIndex(item => item.id === message.id)

      for (let index = messageIndex - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'user') {
          sessionExecutionStore.setInputText(sessionId, messages[index].content ?? '')
          sessionExecutionStore.setPendingImages(sessionId, await toPendingImages(messages[index].attachments ?? []))
          break
        }
      }
    }

    composerRef.value?.focusInput()
  }

  onMounted(async () => {
    await miniPanelStore.initSessionContext()
    composerRef.value?.focusInput()
    document.addEventListener('keydown', handleEscapeKey, true)

    const currentWindow = getCurrentWindow()
    unlistenFocus = await currentWindow.listen('mini-panel:focus-input', () => {
      composerRef.value?.focusInput()
    })
  })

  onUnmounted(() => {
    unlistenFocus?.()
    document.removeEventListener('keydown', handleEscapeKey, true)
  })

  return {
    // 子组件
    MessageList,
    ConversationComposer,
    // store
    miniPanelStore,
    // refs
    composerRef,
    // 方法
    handleRetry
  }
}
