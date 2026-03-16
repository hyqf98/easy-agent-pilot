<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaModal } from '@/components/common'

const props = defineProps<{
  visible: boolean
  config: UnifiedSkillConfig | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  save: [config: Partial<UnifiedSkillConfig>, originalId?: string]
}>()

const { t } = useI18n()

const form = ref({
  name: '',
  description: '',
  skillPath: '',
  scriptsPath: '',
  referencesPath: '',
  assetsPath: '',
})

const isEdit = computed(() => !!props.config?.id)
const title = computed(() =>
  isEdit.value ? t('settings.sdkConfig.skills.edit') : t('settings.sdkConfig.skills.add')
)
const isValid = computed(() => Boolean(form.value.name.trim() && form.value.skillPath.trim()))

function resetForm() {
  form.value = {
    name: '',
    description: '',
    skillPath: '',
    scriptsPath: '',
    referencesPath: '',
    assetsPath: '',
  }
}

watch(() => props.config, (config) => {
  if (!config) {
    resetForm()
    return
  }

  form.value = {
    name: config.name,
    description: config.description || '',
    skillPath: config.skillPath,
    scriptsPath: config.scriptsPath || '',
    referencesPath: config.referencesPath || '',
    assetsPath: config.assetsPath || '',
  }
}, { immediate: true })

function close() {
  emit('update:visible', false)
}

function handleSave() {
  if (!isValid.value) {
    return
  }

  emit('save', {
    name: form.value.name.trim(),
    description: form.value.description.trim() || undefined,
    skillPath: form.value.skillPath.trim(),
    scriptsPath: form.value.scriptsPath.trim() || undefined,
    referencesPath: form.value.referencesPath.trim() || undefined,
    assetsPath: form.value.assetsPath.trim() || undefined,
  }, props.config?.id)

  close()
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="skill-edit-modal"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="skill-edit-modal__header">
        <div class="skill-edit-modal__title">
          <EaIcon name="lucide:book-open" />
          <span>{{ title }}</span>
        </div>
        <button
          class="skill-edit-modal__close"
          type="button"
          @click="close"
        >
          <EaIcon name="lucide:x" />
        </button>
      </div>
    </template>

    <div class="skill-edit-modal__body">
      <div class="form-group">
        <label>{{ t('settings.sdkConfig.skills.name') }}</label>
        <input
          v-model="form.name"
          type="text"
          :placeholder="t('settings.sdkConfig.skills.namePlaceholder')"
        >
      </div>

      <div class="form-group">
        <label>{{ t('settings.sdkConfig.skills.description') }}</label>
        <textarea
          v-model="form.description"
          rows="3"
          :placeholder="t('settings.sdkConfig.skills.descriptionPlaceholder')"
        />
      </div>

      <div class="form-group">
        <label>{{ t('settings.sdkConfig.skills.path') }}</label>
        <input
          v-model="form.skillPath"
          type="text"
          :placeholder="t('settings.sdkConfig.skills.pathPlaceholder')"
        >
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>{{ t('settings.sdkConfig.skills.scriptsPath') }}</label>
          <input
            v-model="form.scriptsPath"
            type="text"
            :placeholder="t('settings.sdkConfig.skills.scriptsPathPlaceholder')"
          >
        </div>

        <div class="form-group">
          <label>{{ t('settings.sdkConfig.skills.referencesPath') }}</label>
          <input
            v-model="form.referencesPath"
            type="text"
            :placeholder="t('settings.sdkConfig.skills.referencesPathPlaceholder')"
          >
        </div>
      </div>

      <div class="form-group">
        <label>{{ t('settings.sdkConfig.skills.assetsPath') }}</label>
        <input
          v-model="form.assetsPath"
          type="text"
          :placeholder="t('settings.sdkConfig.skills.assetsPathPlaceholder')"
        >
      </div>
    </div>

    <template #footer>
      <EaButton
        type="ghost"
        @click="close"
      >
        {{ t('common.cancel') }}
      </EaButton>
      <EaButton
        :disabled="!isValid"
        @click="handleSave"
      >
        {{ isEdit ? t('common.save') : t('common.create') }}
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped>
:deep(.skill-edit-modal) {
  width: min(680px, calc(100vw - var(--spacing-8)));
}

.skill-edit-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
}

.skill-edit-modal__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.skill-edit-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
}

.skill-edit-modal__close:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.skill-edit-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-group label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-bg);
}

@media (max-width: 720px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
