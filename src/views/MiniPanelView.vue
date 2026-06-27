<script setup lang="ts">
import { onMounted, onUnmounted, ref, type ComponentPublicInstance } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { MessageList } from '@/components/message'
import ConversationComposer from '@/components/layout/conversationComposer/ConversationComposer.vue'
import { useMessageStore, type Message, type MessageAttachment } from '@/stores/message'
import { useMiniPanelStore } from '@/stores/miniPanel'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { resolveAttachmentPreviewUrl } from '@/utils/attachmentPreview'

const miniPanelStore = useMiniPanelStore()
const messageStore = useMessageStore()
const sessionExecutionStore = useSessionExecutionStore()

type ComposerExposed = ComponentPublicInstance & {
  focusInput: () => void
  openCompressionDialog: () => void
}

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
</script>

<template>
  <div class="mini-panel">
    <div class="mini-panel__body">
      <section class="mini-panel__conversation">
        <MessageList
          :key="miniPanelStore.sessionId || 'mini-panel-empty'"
          class="mini-panel__messages"
          :session-id="miniPanelStore.sessionId || undefined"
          @retry="handleRetry"
        />
      </section>

      <ConversationComposer
        ref="composerRef"
        panel-type="mini"
        :session-id="miniPanelStore.sessionId"
        :working-directory="miniPanelStore.workingDirectory"
        :set-working-directory="miniPanelStore.setWorkingDirectory"
        show-working-directory
        compact
        class="mini-panel__composer"
      />
    </div>
  </div>
</template>
<style scoped src="./MiniPanelView.css"></style>
