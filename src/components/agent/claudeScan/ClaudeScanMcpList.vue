<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScannedMcpServer } from '@/stores/skillConfigShared'

defineProps<{
  items: ScannedMcpServer[]
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
      {{ t('settings.agent.scan.noMcpFound') }}
    </div>
    <template v-else>
      <div class="scan-list__header">
        <label class="scan-checkbox">
          <input
            type="checkbox"
            :checked="selectedNames.length === items.length"
            @change="$emit('toggle-all')"
          >
          <span>{{ t('settings.agent.scan.serverName') }}</span>
        </label>
        <span class="scan-list__col scan-list__col--small">{{ t('settings.agent.scan.transport') }}</span>
        <span class="scan-list__col scan-list__col--small">{{ t('settings.agent.scan.scope') }}</span>
        <span class="scan-list__col">{{ t('settings.agent.scan.commandOrUrl') }}</span>
      </div>
      <div
        v-for="server in items"
        :key="server.name"
        class="scan-list__item"
        :class="{ 'scan-list__item--selected': selectedNames.includes(server.name) }"
        @click="$emit('toggle-item', server.name)"
      >
        <label class="scan-checkbox">
          <input
            type="checkbox"
            :checked="selectedNames.includes(server.name)"
            @click.stop
            @change="$emit('toggle-item', server.name)"
          >
          <span class="scan-list__item-name">{{ server.name }}</span>
        </label>
        <span class="scan-list__col scan-list__col--small">
          <span
            class="scan-badge"
            :class="`scan-badge--${server.transport}`"
          >
            {{ server.transport.toUpperCase() }}
          </span>
        </span>
        <span class="scan-list__col scan-list__col--small">
          <span
            class="scan-badge scan-badge--scope"
            :class="`scan-badge--${server.scope}`"
          >
            {{ t(`settings.agent.scan.scopeTypes.${server.scope}`) }}
          </span>
        </span>
        <span class="scan-list__col scan-list__item-command">
          <template v-if="server.transport === 'stdio'">
            {{ server.command }}
            <span
              v-if="server.args && server.args.length > 0"
              class="scan-list__item-args"
            >
              {{ server.args.join(' ') }}
            </span>
          </template>
          <template v-else>
            {{ server.url }}
          </template>
        </span>
      </div>
    </template>
  </div>
</template>
<style scoped src="./ClaudeScanMcpList.css"></style>
