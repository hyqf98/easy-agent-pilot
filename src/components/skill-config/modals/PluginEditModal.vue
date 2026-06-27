<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaModal } from '@/components/common'

const props = defineProps<{
  visible: boolean
  config: UnifiedPluginConfig | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  save: [config: Partial<UnifiedPluginConfig>, originalId?: string]
}>()

const { t } = useI18n()

const form = ref({
  name: '',
  version: '',
  description: '',
  pluginPath: '',
})

const isEdit = computed(() => Boolean(props.config?.id))
const title = computed(() =>
  isEdit.value ? t('settings.sdkConfig.plugins.edit') : t('settings.sdkConfig.plugins.add')
)
const isValid = computed(() => Boolean(form.value.name.trim() && form.value.pluginPath.trim()))

function resetForm() {
  form.value = {
    name: '',
    version: '',
    description: '',
    pluginPath: '',
  }
}

watch(() => props.config, (config) => {
  if (!config) {
    resetForm()
    return
  }

  form.value = {
    name: config.name,
    version: config.version || '',
    description: config.description || '',
    pluginPath: config.pluginPath,
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
    version: form.value.version.trim() || undefined,
    description: form.value.description.trim() || undefined,
    pluginPath: form.value.pluginPath.trim(),
  }, props.config?.id)

  close()
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="plugin-edit-modal"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="plugin-edit-modal__header">
        <div class="plugin-edit-modal__title">
          <EaIcon name="lucide:puzzle" />
          <span>{{ title }}</span>
        </div>
        <button
          type="button"
          class="plugin-edit-modal__close"
          @click="close"
        >
          <EaIcon name="lucide:x" />
        </button>
      </div>
    </template>

    <div class="plugin-edit-modal__body">
      <div class="form-group">
        <label>{{ t('settings.sdkConfig.plugins.name') }}</label>
        <input
          v-model="form.name"
          type="text"
          :placeholder="t('settings.sdkConfig.plugins.namePlaceholder')"
        >
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>{{ t('settings.sdkConfig.plugins.version') }}</label>
          <input
            v-model="form.version"
            type="text"
            placeholder="0.1.0"
          >
        </div>

        <div class="form-group">
          <label>{{ t('settings.sdkConfig.plugins.path') }}</label>
          <input
            v-model="form.pluginPath"
            type="text"
            :placeholder="t('settings.sdkConfig.plugins.pathPlaceholder')"
          >
        </div>
      </div>

      <div class="form-group">
        <label>{{ t('settings.sdkConfig.plugins.description') }}</label>
        <textarea
          v-model="form.description"
          rows="4"
          :placeholder="t('settings.sdkConfig.plugins.descriptionPlaceholder')"
        />
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
<style scoped src="./PluginEditModal.css"></style>
