<script setup lang="ts">
import { usePluginEditModal, type PluginEditModalProps, type PluginEditModalEmits } from './usePluginEditModal'

const props = defineProps<PluginEditModalProps>()
const emit = defineEmits<PluginEditModalEmits>()

const {
  EaButton,
  EaIcon,
  EaModal,
  t,
  form,
  isEdit,
  title,
  isValid,
  close,
  handleSave,
} = usePluginEditModal(props, emit)
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
