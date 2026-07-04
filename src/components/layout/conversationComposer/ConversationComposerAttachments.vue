<script setup lang="ts">
import { EaIcon } from '@/components/common'
import AttachmentThumbnail from '@/components/common/AttachmentThumbnail/AttachmentThumbnail.vue'
import type { ConversationComposerViewState } from './useConversationComposerView'
import { computed } from 'vue'

type Resolved<T> = T extends { value: infer V } ? V : T
type PendingAttachment = Resolved<ConversationComposerViewState['pendingImages']>[number]

const props = defineProps<{
  attachments: PendingAttachment[]
  main: boolean
  removeAttachment: (attachmentId: string) => void
}>()

const attachmentWrapperStyle = computed(() => {
  if (props.main) {
    return {
      width: '56px',
      height: '56px',
      overflow: 'hidden',
      borderRadius: '16px',
      border: '1px solid var(--workspace-border, rgba(38, 38, 38, 0.1))',
      background: 'color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 92%, transparent)',
      boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
    }
  }

  return {
    width: '68px',
    height: '68px',
    overflow: 'hidden',
    borderRadius: '14px',
    border: '1px solid color-mix(in srgb, var(--color-border) 72%, transparent)'
  }
})

const attachmentImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover'
} as const
</script>

<template>
  <div
    v-if="attachments.length > 0"
    class="conversation-composer__attachments"
    :class="{ 'conversation-composer__attachments--main': main }"
  >
    <AttachmentThumbnail
      v-for="attachment in attachments"
      :key="attachment.id"
      :attachment="attachment"
      wrapper-class="conversation-composer__attachment"
      media-class="conversation-composer__attachment-image"
      :wrapper-style="attachmentWrapperStyle"
      :media-style="attachmentImageStyle"
      :preview-max-width="420"
      :preview-max-height="480"
    >
      <button
        type="button"
        class="conversation-composer__attachment-remove"
        :title="$t('common.delete')"
        @click="removeAttachment(attachment.id)"
      >
        <EaIcon
          name="x"
          :size="12"
        />
      </button>
    </AttachmentThumbnail>
  </div>
</template>

<style scoped>
.conversation-composer__attachments {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.conversation-composer__attachments--main {
  gap: 8px;
  align-items: flex-start;
  padding: 0 2px 10px;
}

.conversation-composer__attachment {
  position: relative;
  width: 68px;
  height: 68px;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.conversation-composer__attachment:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.14);
}

.conversation-composer__attachments--main .conversation-composer__attachment {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  border-color: var(--workspace-border, rgba(38, 38, 38, 0.1));
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 92%, transparent);
  box-shadow: 0 8px 16px rgba(24, 24, 22, 0.06);
  animation: attachment-pop-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.conversation-composer__attachment-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.conversation-composer__attachment-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--workspace-panel-bg, #ffffff) 92%, transparent);
  color: var(--workspace-text-primary, var(--color-text-primary));
  border: 1px solid var(--workspace-border, rgba(38, 38, 38, 0.1));
  box-shadow: 0 4px 12px rgba(24, 24, 22, 0.08);
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.16s ease, transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}

.conversation-composer__attachment:hover .conversation-composer__attachment-remove,
.conversation-composer__attachment:focus-within .conversation-composer__attachment-remove {
  opacity: 1;
  transform: translateY(0);
}

.conversation-composer__attachment-remove:hover {
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 88%, white);
  border-color: color-mix(in srgb, var(--color-primary, #2563eb) 18%, var(--workspace-border, rgba(38, 38, 38, 0.1)));
}

.conversation-composer__attachments--main .conversation-composer__attachment-remove {
  width: 16px;
  height: 16px;
  opacity: 0.7;
  transform: none;
}

@keyframes attachment-pop-in {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

:global([data-theme='dark']) .conversation-composer__attachment,
:global(.dark) .conversation-composer__attachment {
  border-color: rgba(71, 85, 105, 0.72);
  background: rgba(15, 23, 42, 0.9);
  box-shadow: none;
}

:global([data-theme='dark']) .conversation-composer__attachment-remove,
:global(.dark) .conversation-composer__attachment-remove {
  background: rgba(15, 23, 42, 0.86);
  color: rgba(255, 255, 255, 0.92);
  border-color: rgba(148, 163, 184, 0.24);
}

:global([data-theme='dark']) .conversation-composer__attachment-remove:hover,
:global(.dark) .conversation-composer__attachment-remove:hover {
  background: rgba(30, 41, 59, 0.92);
}
</style>
