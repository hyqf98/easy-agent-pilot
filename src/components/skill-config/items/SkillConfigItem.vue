<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

defineProps<{
  config: UnifiedSkillConfig
  isReadOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'detail', config: UnifiedSkillConfig): void
  (e: 'edit', config: UnifiedSkillConfig): void
  (e: 'delete', config: UnifiedSkillConfig): void
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="skill-config-item"
    :class="{ 'skill-config-item--disabled': !config.enabled }"
  >
    <div class="skill-config-item__header">
      <div class="skill-config-item__name">
        <EaIcon
          name="lucide:book-open"
          class="skill-config-item__icon"
        />
        <span>{{ config.name }}</span>
      </div>
      <div class="skill-config-item__actions">
        <EaButton
          size="small"
          variant="ghost"
          class="btn-view"
          @click="emit('detail', config)"
        >
          <EaIcon name="lucide:info" />
          {{ t('common.view') }}
        </EaButton>
        <EaButton
          v-if="!isReadOnly"
          size="small"
          variant="ghost"
          class="btn-edit"
          @click="emit('edit', config)"
        >
          <EaIcon name="lucide:pencil" />
          {{ t('common.edit') }}
        </EaButton>
        <EaButton
          v-if="!isReadOnly"
          size="small"
          variant="ghost"
          class="btn-delete"
          @click="emit('delete', config)"
        >
          <EaIcon name="lucide:trash-2" />
          {{ t('common.delete') }}
        </EaButton>
      </div>
    </div>

    <div
      v-if="config.description"
      class="skill-config-item__description"
    >
      {{ config.description }}
    </div>

    <div class="skill-config-item__path">
      <EaIcon name="lucide:folder" />
      {{ config.skillPath }}
    </div>

    <div
      v-if="config.scriptsPath || config.referencesPath || config.assetsPath"
      class="skill-config-item__subdirs"
    >
      <span
        v-if="config.scriptsPath"
        class="skill-config-item__subdir"
      >
        <EaIcon name="lucide:file-code" />
        {{ t('settings.agent.scan.hasScripts') }}
      </span>
      <span
        v-if="config.referencesPath"
        class="skill-config-item__subdir"
      >
        <EaIcon name="lucide:book" />
        {{ t('settings.agent.scan.hasReferences') }}
      </span>
      <span
        v-if="config.assetsPath"
        class="skill-config-item__subdir"
      >
        <EaIcon name="lucide:image" />
        {{ t('settings.agent.scan.hasAssets') }}
      </span>
    </div>
  </div>
</template>
<style scoped src="./SkillConfigItem.css"></style>
