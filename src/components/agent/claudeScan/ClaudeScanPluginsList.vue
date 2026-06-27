<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScannedPlugin } from '@/stores/skillConfigShared'

defineProps<{
  items: ScannedPlugin[]
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
      {{ t('settings.agent.scan.noPluginsFound') }}
    </div>
    <template v-else>
      <div class="scan-list__header">
        <label class="scan-checkbox">
          <input
            type="checkbox"
            :checked="selectedNames.length === items.length"
            @change="$emit('toggle-all')"
          >
          <span>{{ t('settings.agent.scan.pluginName') }}</span>
        </label>
        <span class="scan-list__col scan-list__col--small">{{ t('settings.agent.scan.version') }}</span>
        <span class="scan-list__col scan-list__col--subdirs">{{ t('settings.agent.scan.components') }}</span>
        <span class="scan-list__col scan-list__col--small">{{ t('settings.agent.scan.status') }}</span>
      </div>
      <div
        v-for="plugin in items"
        :key="plugin.name"
        class="scan-list__item"
        :class="{ 'scan-list__item--selected': selectedNames.includes(plugin.name) }"
        @click="$emit('toggle-item', plugin.name)"
      >
        <label class="scan-checkbox">
          <input
            type="checkbox"
            :checked="selectedNames.includes(plugin.name)"
            @click.stop
            @change="$emit('toggle-item', plugin.name)"
          >
          <span class="scan-list__item-name">{{ plugin.name }}</span>
        </label>
        <span class="scan-list__col scan-list__col--small scan-list__item-version">
          {{ plugin.version || '-' }}
        </span>
        <span class="scan-list__col scan-list__col--subdirs">
          <span
            v-if="plugin.subdirectories.has_agents"
            class="scan-plugin-badge"
            :title="t('settings.agent.scan.hasAgents')"
          >
            agents
          </span>
          <span
            v-if="plugin.subdirectories.has_commands"
            class="scan-plugin-badge scan-plugin-badge--commands"
            :title="t('settings.agent.scan.hasCommands')"
          >
            cmds
          </span>
          <span
            v-if="plugin.subdirectories.has_skills"
            class="scan-plugin-badge scan-plugin-badge--skills"
            :title="t('settings.agent.scan.hasSkills')"
          >
            skills
          </span>
          <span
            v-if="plugin.subdirectories.has_hooks"
            class="scan-plugin-badge scan-plugin-badge--hooks"
            :title="t('settings.agent.scan.hasHooks')"
          >
            hooks
          </span>
          <span
            v-if="plugin.subdirectories.has_scripts"
            class="scan-plugin-badge scan-plugin-badge--scripts"
            :title="t('settings.agent.scan.hasScripts')"
          >
            scripts
          </span>
          <span
            v-if="!plugin.subdirectories.has_agents && !plugin.subdirectories.has_commands && !plugin.subdirectories.has_skills && !plugin.subdirectories.has_hooks && !plugin.subdirectories.has_scripts"
            class="scan-subdir-badge--empty"
          >
            -
          </span>
        </span>
        <span class="scan-list__col scan-list__col--small">
          <span
            class="scan-status-badge"
            :class="plugin.enabled ? 'scan-status-badge--enabled' : 'scan-status-badge--disabled'"
          >
            {{ plugin.enabled ? t('settings.agent.scan.enabled') : t('settings.agent.scan.disabled') }}
          </span>
        </span>
      </div>
    </template>
  </div>
</template>
<style scoped src="./ClaudeScanPluginsList.css"></style>
