<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaModal } from '@/components/common'
import { displayCliSessionMessage } from '@/utils/sessionManager'
import type { AcpSessionInfo } from '@/types/cliSessionManager'

interface Props {
  visible: boolean
  deleting: boolean
  sessions: AcpSessionInfo[]
  error: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: []
}>()

const { t } = useI18n()

const modalVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

const isBulkDelete = computed(() => props.sessions.length > 1)
const deletePreviewSessions = computed(() => props.sessions.slice(0, 5))

const displayMessage = (session: AcpSessionInfo) =>
  displayCliSessionMessage(session, t('settings.sessionManager.noPreview'))
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