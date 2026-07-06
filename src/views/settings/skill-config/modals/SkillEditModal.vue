<script setup lang="ts">
/** SkillEditModal 组件：技能新增/编辑弹窗（逻辑见 useSkillEditModal.ts） */
import { useSkillEditModal, type SkillEditModalProps, type SkillEditModalEmits } from './useSkillEditModal'

const props = defineProps<SkillEditModalProps>()
const emit = defineEmits<SkillEditModalEmits>()

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
} = useSkillEditModal(props, emit)
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
