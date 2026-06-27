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
<style scoped src="./SkillEditModal.css"></style>
