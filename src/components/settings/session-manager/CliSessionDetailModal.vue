<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon, EaModal } from '@/components/common'
import {
  getCliMessageColor,
  getCliMessageDisplayContent,
  getCliMessageIcon,
  isAgentEvent,
  isUserEvent,
  getEventCollapsedPreview
} from '@/utils/sessionManager'
import type { AcpSessionHistoryResult, AcpReplayedEvent } from '@/types/cliSessionManager'

interface Props {
  visible: boolean
  loading: boolean
  error: string
  detail: AcpSessionHistoryResult | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { t } = useI18n()

const modalVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

const expandedEventKeys = ref<number[]>([])
const expandedEventKeySet = computed(() => new Set(expandedEventKeys.value))

const fallbackLabels = computed(() => ({
  noContent: t('settings.sessionManager.noPreview'),
  toolCall: '[Tool Call]',
  toolResult: '[Tool Result]',
  usage: '[Usage]'
}))

const getEventDisplayContent = (event: AcpReplayedEvent) =>
  getCliMessageDisplayContent(event, fallbackLabels.value)

const getMessageAlignmentClass = (event: AcpReplayedEvent) => {
  if (isAgentEvent(event)) return 'message-row--assistant'
  if (isUserEvent(event)) return 'message-row--user'
  return 'message-row--event'
}

const getBubbleClass = (event: AcpReplayedEvent) => {
  if (isAgentEvent(event)) return 'message-bubble--assistant'
  if (isUserEvent(event)) return 'message-bubble--user'
  return 'message-bubble--event'
}

const isExpanded = (index: number) => expandedEventKeySet.value.has(index)

const toggleExpanded = (index: number) => {
  const next = new Set(expandedEventKeys.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  expandedEventKeys.value = Array.from(next)
}

const getCollapsedPreview = (event: AcpReplayedEvent) =>
  getEventCollapsedPreview(event, fallbackLabels.value, t('settings.sessionManager.noPreview'))

/** 获取事件的原始 JSON 展开（工具类事件展示 toolInput/toolResult） */
const getRawContent = (event: AcpReplayedEvent): string | null => {
  if (event.eventType === 'tool_call' && event.toolInput) return event.toolInput
  if (event.eventType === 'tool_result' && event.toolResult) return event.toolResult
  return null
}

watch(() => props.detail?.sessionId, () => {
  expandedEventKeys.value = []
})

watch(() => props.visible, (visible) => {
  if (!visible) {
    expandedEventKeys.value = []
  }
})
</script>

<template>
  <EaModal
    v-model:visible="modalVisible"
    content-class="cli-session-detail-modal"
  >
    <template #header>
      <div class="modal-title-wrap">
        <h3 class="modal-title">
          {{ t('settings.sessionManager.detailTitle') }}
        </h3>
        <span
          v-if="detail"
          class="modal-subtitle"
        >
          {{ detail.events.length }} {{ t('settings.sessionManager.messages') }}
        </span>
      </div>
    </template>

    <div
      v-if="loading"
      class="loading"
    >
      <EaIcon
        name="loader"
        :size="20"
        spin
      />
      <span>{{ t('common.loading') }}</span>
    </div>

    <div
      v-else-if="error"
      class="error"
    >
      <EaIcon
        name="alert-circle"
        :size="18"
      />
      <span>{{ error }}</span>
    </div>

    <div
      v-else-if="detail"
      class="detail"
    >
      <div class="detail-summary">
        <div class="detail-summary__item">
          <EaIcon
            name="hash"
            :size="14"
          />
          <span class="detail-summary__label">ID:</span>
          <code class="detail-summary__value">{{ detail.sessionId }}</code>
        </div>
      </div>

      <div class="message-feed">
        <div
          v-for="(event, index) in detail.events"
          :key="index"
          class="message-row"
          :class="getMessageAlignmentClass(event)"
        >
          <div
            class="message-bubble"
            :class="getBubbleClass(event)"
          >
            <div class="message-item__header">
              <div class="message-item__type">
                <EaIcon
                  :name="getCliMessageIcon(event.eventType)"
                  :size="14"
                  :style="{ color: getCliMessageColor(event.eventType) }"
                />
                <span>{{ event.eventType }}</span>
                <span
                  v-if="event.toolName"
                  class="message-item__role"
                >
                  {{ event.toolName }}
                </span>
                <span
                  v-else-if="event.role"
                  class="message-item__role"
                >
                  {{ event.role }}
                </span>
              </div>
              <div class="message-item__meta">
                <button
                  type="button"
                  class="message-item__toggle"
                  @click="toggleExpanded(index)"
                >
                  <EaIcon
                    :name="isExpanded(index) ? 'chevron-up' : 'chevron-down'"
                    :size="14"
                  />
                  <span>{{ isExpanded(index) ? '收起' : '展开' }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="!isExpanded(index)"
              class="message-item__preview"
            >
              {{ getCollapsedPreview(event) }}
            </div>

            <div
              v-else
              class="message-item__content"
            >
              {{ getEventDisplayContent(event) }}
            </div>

            <details
              v-if="isExpanded(index) && getRawContent(event)"
              class="message-item__raw"
            >
              <summary>Raw</summary>
              <pre>{{ getRawContent(event) }}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  </EaModal>
</template>
<style scoped src="./CliSessionDetailModal.css"></style>