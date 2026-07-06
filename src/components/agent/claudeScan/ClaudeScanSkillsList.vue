<script setup lang="ts">
/** ClaudeScanSkillsList 组件：Claude 扫描结果中的技能列表，支持全选与单项勾选导入 */
import { useI18n } from 'vue-i18n'
import type { ScannedSkill } from '@/stores/skillConfigShared'

defineProps<{
  items: ScannedSkill[]
  selectedNames: string[]
}>()

defineEmits<{
  (e: 'toggle-all'): void
  (e: 'toggle-item', name: string): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="scan-list">
    <div
      v-if="items.length === 0"
      class="scan-list__empty"
    >
      {{ t('settings.agent.scan.noSkillsFound') }}
    </div>
    <template v-else>
      <div class="scan-list__header">
        <label class="scan-checkbox">
          <input
            type="checkbox"
            :checked="selectedNames.length === items.length"
            @change="$emit('toggle-all')"
          >
          <span>{{ t('settings.agent.scan.skillName') }}</span>
        </label>
        <span class="scan-list__col scan-list__col--subdirs">{{ t('settings.agent.scan.subdirectories') }}</span>
        <span class="scan-list__col">{{ t('settings.agent.scan.description') }}</span>
      </div>
      <div
        v-for="skill in items"
        :key="skill.name"
        class="scan-list__item"
        :class="{ 'scan-list__item--selected': selectedNames.includes(skill.name) }"
        @click="$emit('toggle-item', skill.name)"
      >
        <label class="scan-checkbox">
          <input
            type="checkbox"
            :checked="selectedNames.includes(skill.name)"
            @click.stop
            @change="$emit('toggle-item', skill.name)"
          >
          <span class="scan-list__item-name">{{ skill.name }}</span>
        </label>
        <span class="scan-list__col scan-list__col--subdirs">
          <span
            v-if="skill.subdirectories.has_scripts"
            class="scan-subdir-badge"
            :title="t('settings.agent.scan.hasScripts')"
          >
            scripts
          </span>
          <span
            v-if="skill.subdirectories.has_references"
            class="scan-subdir-badge scan-subdir-badge--refs"
            :title="t('settings.agent.scan.hasReferences')"
          >
            refs
          </span>
          <span
            v-if="skill.subdirectories.has_assets"
            class="scan-subdir-badge scan-subdir-badge--assets"
            :title="t('settings.agent.scan.hasAssets')"
          >
            assets
          </span>
          <span
            v-if="!skill.subdirectories.has_scripts && !skill.subdirectories.has_references && !skill.subdirectories.has_assets"
            class="scan-subdir-badge--empty"
          >
            -
          </span>
        </span>
        <span class="scan-list__col scan-list__item-desc">
          {{ skill.description || '-' }}
        </span>
      </div>
    </template>
  </div>
</template>
<style scoped src="./ClaudeScanSkillsList.css"></style>
