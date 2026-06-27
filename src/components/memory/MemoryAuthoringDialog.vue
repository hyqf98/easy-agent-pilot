<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaInput, EaModal } from '@/components/common'
import EaSelect from '@/components/common/EaSelect/EaSelect.vue'
import type { SelectOption } from '@/components/common/EaSelect/useEaSelect'
import ExecutionTimeline from '@/components/message/ExecutionTimeline/ExecutionTimeline.vue'
import { useMemoryAuthoringDialog } from './memoryAuthoringDialog/useMemoryAuthoringDialog'

const props = defineProps<{
  dialog: ReturnType<typeof useMemoryAuthoringDialog>
}>()

const { t } = useI18n()
const dialog = props.dialog
const {
  visible,
  isRunning,
  draftName,
  draftDescription,
  draftMarkdown,
  instruction,
  selectedExpertId,
  selectedRecordCount,
  canGenerateInitialDraft,
  canConfirm,
  canTriggerGeneration,
  messagesContainerRef,
  timelineEntries,
  runtimeStatusText
} = dialog

const expertOptions = computed<SelectOption[]>(() =>
  dialog.availableExperts.value.map(expert => ({
    value: expert.id,
    label: expert.name
  }))
)

function handleVisibleChange(nextVisible: boolean) {
  if (!nextVisible) {
    dialog.closeDialog()
  }
}

function handleInstructionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
    return
  }

  event.preventDefault()
  if (!canTriggerGeneration.value) {
    return
  }

  void dialog.submitInstruction()
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="memory-authoring-dialog"
    overlay-class="memory-authoring-dialog__overlay"
    @update:visible="handleVisibleChange"
  >
    <template #header>
      <div class="memory-authoring-dialog__header">
        <div>
          <p class="memory-authoring-dialog__eyebrow">
            {{ t('memory.authoring.eyebrow') }}
          </p>
          <h3 class="memory-authoring-dialog__title">
            {{ t('memory.authoring.title') }}
          </h3>
        </div>
        <button
          type="button"
          class="memory-authoring-dialog__close"
          @click="dialog.closeDialog"
        >
          ×
        </button>
      </div>
    </template>

    <div class="memory-authoring-workspace">
      <section class="memory-authoring-pane memory-authoring-pane--conversation">
        <div
          ref="messagesContainerRef"
          class="memory-authoring-timeline"
        >
          <ExecutionTimeline
            v-if="timelineEntries.length"
            :entries="timelineEntries"
            group-tool-calls
          />

          <div
            v-if="isRunning"
            class="memory-authoring-running"
          >
            <span class="memory-authoring-running__spinner" />
            <span>{{ runtimeStatusText || t('memory.authoring.running') }}</span>
          </div>
        </div>

        <div class="memory-authoring-composer">
          <div class="memory-authoring-composer__head">
            <label class="memory-authoring-field memory-authoring-field--agent">
              <EaSelect
                v-model="selectedExpertId"
                :options="expertOptions"
                :placeholder="t('memory.authoring.agentLabel')"
              />
            </label>

            <div class="memory-authoring-composer__meta">
              <EaButton
                v-if="selectedRecordCount > 0"
                type="secondary"
                size="small"
                :disabled="!canGenerateInitialDraft"
                @click="dialog.generateInitialDraft"
              >
                {{ t('memory.authoring.generateDraft') }}
              </EaButton>
              <EaButton
                v-if="isRunning"
                type="danger"
                size="small"
                @click="dialog.stopGeneration"
              >
                {{ t('memory.authoring.stop') }}
              </EaButton>
            </div>
          </div>

          <div class="memory-authoring-composer__input-wrap">
            <textarea
              v-model="instruction"
              class="memory-authoring-composer__input"
              :disabled="isRunning"
              rows="3"
              :placeholder="t('memory.authoring.inputPlaceholder')"
              @keydown="handleInstructionKeydown"
            />
          </div>
        </div>
      </section>

      <section class="memory-authoring-pane memory-authoring-pane--draft">
        <div class="memory-authoring-draft__meta">
          <label class="memory-authoring-field">
            <span>{{ t('memory.authoring.nameLabel') }}</span>
            <EaInput
              v-model="draftName"
              :placeholder="t('memory.authoring.namePlaceholder')"
            />
          </label>

          <label class="memory-authoring-field">
            <span>{{ t('memory.authoring.descriptionLabel') }}</span>
            <textarea
              v-model="draftDescription"
              class="memory-authoring-draft__description"
              rows="3"
              :placeholder="t('memory.authoring.descriptionPlaceholder')"
            />
          </label>
        </div>

        <div class="memory-authoring-draft__body">
          <textarea
            v-model="draftMarkdown"
            class="memory-authoring-draft__editor"
          />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="memory-authoring-footer">
        <div class="memory-authoring-footer__actions">
          <EaButton
            type="secondary"
            @click="dialog.closeDialog"
          >
            {{ t('common.cancel') }}
          </EaButton>
          <EaButton
            :disabled="!canConfirm"
            @click="dialog.confirmCreate"
          >
            {{ t('common.create') }}
          </EaButton>
        </div>
      </div>
    </template>
  </EaModal>
</template>
<style scoped src="./MemoryAuthoringDialog.css"></style>
