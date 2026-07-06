<script setup lang="ts">
import {
  useCliSessionDetailModal,
  type CliSessionDetailModalProps,
  type CliSessionDetailModalEmits
} from './useCliSessionDetailModal'

const props = defineProps<CliSessionDetailModalProps>()
const emit = defineEmits<CliSessionDetailModalEmits>()

const {
  EaIcon,
  EaModal,
  getCliMessageIcon,
  getCliMessageColor,
  t,
  modalVisible,
  getMessageAlignmentClass,
  getBubbleClass,
  isExpanded,
  toggleExpanded,
  getCollapsedPreview,
  getEventDisplayContent,
  getRawContent
} = useCliSessionDetailModal(props, emit)
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
