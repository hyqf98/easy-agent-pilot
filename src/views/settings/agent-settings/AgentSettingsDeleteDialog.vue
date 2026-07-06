<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'

interface Props {
  visible: boolean
  agentName: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: []
  cancel: []
}>()

const { t } = useI18n()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

function handleClose() {
  emit('update:visible', false)
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dialogVisible"
      class="modal-overlay"
      @click="handleClose"
    >
      <div
        class="confirm-dialog"
        @click.stop
      >
        <div class="confirm-dialog__content">
          <EaIcon
            name="alert-triangle"
            :size="24"
            class="confirm-dialog__icon"
          />
          <h4 class="confirm-dialog__title">
            {{ t('common.confirmDelete') }}
          </h4>
          <p class="confirm-dialog__message">
            {{ t('settings.agentList.confirmDeleteMessage', { name: agentName }) }}
          </p>
        </div>
        <div class="confirm-dialog__actions">
          <EaButton
            type="secondary"
            @click="handleClose"
          >
            {{ t('common.cancel') }}
          </EaButton>
          <EaButton
            type="danger"
            @click="emit('confirm')"
          >
            {{ t('common.confirmDelete') }}
          </EaButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped src="./AgentSettingsDeleteDialog.css"></style>
