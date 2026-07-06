<script setup lang="ts">
/** CliSessionDeleteModal 组件：CLI 会话删除确认弹窗（逻辑见 useCliSessionDeleteModal.ts） */
import { useCliSessionDeleteModal, type CliSessionDeleteModalProps, type CliSessionDeleteModalEmits } from './useCliSessionDeleteModal'

const props = defineProps<CliSessionDeleteModalProps>()
const emit = defineEmits<CliSessionDeleteModalEmits>()

const {
  EaButton,
  EaIcon,
  EaModal,
  t,
  modalVisible,
  isBulkDelete,
  deletePreviewSessions,
  displayMessage
} = useCliSessionDeleteModal(props, emit)
</script>

<template>
  <EaModal v-model:visible="modalVisible">
    <template #header>
      <h3 class="modal-title">
        {{ isBulkDelete ? t('settings.sessionManager.confirmBatchDeleteTitle') : t('settings.sessionManager.confirmDeleteTitle') }}
      </h3>
    </template>

    <p class="confirm-text">
      {{ isBulkDelete ? t('settings.sessionManager.confirmBatchDeleteDesc', { n: sessions.length }) : t('settings.sessionManager.confirmDeleteDesc') }}
    </p>

    <div
      v-if="sessions.length > 0"
      class="confirm-session-list"
    >
      <div
        v-for="session in deletePreviewSessions"
        :key="session.sessionId"
        class="confirm-session"
      >
        <div class="confirm-session__preview">
          {{ displayMessage(session) }}
        </div>
        <code class="confirm-session__path">{{ session.sessionId }}</code>
      </div>

      <div
        v-if="sessions.length > deletePreviewSessions.length"
        class="confirm-session__more"
      >
        {{ t('settings.sessionManager.moreSelected', { n: sessions.length - deletePreviewSessions.length }) }}
      </div>
    </div>

    <div
      v-if="error"
      class="error"
    >
      <EaIcon
        name="alert-circle"
        :size="16"
      />
      <span>{{ error }}</span>
    </div>

    <template #footer>
      <EaButton
        type="secondary"
        :disabled="deleting"
        @click="modalVisible = false"
      >
        {{ t('common.cancel') }}
      </EaButton>
      <EaButton
        type="danger"
        :loading="deleting"
        @click="emit('confirm')"
      >
        {{ t('settings.sessionManager.delete') }}
      </EaButton>
    </template>
  </EaModal>
</template>
<style scoped src="./CliSessionDeleteModal.css"></style>