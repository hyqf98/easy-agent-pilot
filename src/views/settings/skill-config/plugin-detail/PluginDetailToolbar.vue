<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'
import type { InternalItem, PluginSection } from './shared'
import { PLUGIN_SECTION_KEYS, getPluginItemIcon } from './shared'

const props = defineProps<{
  plugin: UnifiedPluginConfig
  pluginVersion?: string | null
  selectedItem: InternalItem | null
  activeSection: PluginSection
  currentListCount: number
  hasListItems: boolean
  isEditMode: boolean
  hasFileContent: boolean
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'delete'): void
  (e: 'toggle-edit'): void
  (e: 'save'): void
}>()

const { t } = useI18n()

const currentSectionLabel = computed(() => t(PLUGIN_SECTION_KEYS[props.activeSection]))
</script>

<template>
  <div class="plugin-detail-toolbar">
    <div class="plugin-detail-toolbar__left">
      <EaButton
        variant="ghost"
        size="small"
        @click="$emit('back')"
      >
        <EaIcon name="lucide:arrow-left" />
        {{ t('common.back') }}
      </EaButton>
      <div class="plugin-detail-toolbar__breadcrumb">
        <EaIcon
          name="lucide:puzzle"
          class="plugin-detail-toolbar__icon"
        />
        <span class="plugin-detail-toolbar__name">{{ plugin.name }}</span>
        <span
          v-if="pluginVersion"
          class="plugin-detail-toolbar__version"
        >v{{ pluginVersion }}</span>
        <template v-if="selectedItem">
          <EaIcon
            name="lucide:chevron-right"
            class="plugin-detail-toolbar__chevron"
          />
          <EaIcon
            :name="getPluginItemIcon(selectedItem.item_type)"
            class="plugin-detail-toolbar__type-icon"
          />
          <span class="plugin-detail-toolbar__current-file">{{ selectedItem.name }}</span>
        </template>
      </div>
    </div>

    <div class="plugin-detail-toolbar__right">
      <div
        v-if="hasListItems && !selectedItem"
        class="plugin-detail-toolbar__list-hint"
      >
        <EaIcon name="lucide:list" />
        <span>{{ currentListCount }} {{ currentSectionLabel }}</span>
        <span class="plugin-detail-toolbar__hint-text">{{ t('settings.plugins.hoverToExpand') }}</span>
      </div>

      <EaButton
        v-if="hasFileContent && plugin.source === 'file'"
        :variant="isEditMode ? 'primary' : 'ghost'"
        size="small"
        @click="$emit('toggle-edit')"
      >
        <EaIcon :name="isEditMode ? 'lucide:eye' : 'lucide:pencil'" />
        {{ isEditMode ? t('common.view') : t('common.edit') }}
      </EaButton>

      <EaButton
        v-if="isEditMode"
        variant="primary"
        size="small"
        @click="$emit('save')"
      >
        <EaIcon name="lucide:save" />
        {{ t('common.save') }}
      </EaButton>

      <EaButton
        v-if="plugin.source === 'file'"
        variant="ghost"
        size="small"
        danger
        @click="$emit('delete')"
      >
        <EaIcon name="lucide:trash-2" />
      </EaButton>
    </div>
  </div>
</template>
<style scoped src="./PluginDetailToolbar.css"></style>
