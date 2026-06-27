<script setup lang="ts">
import type { CliType } from '@/stores/providerProfile'
import { EaIcon } from '@/components/common'
import { useI18n } from 'vue-i18n'

defineProps<{
  currentCliType: CliType
}>()

const emit = defineEmits<{
  change: [type: CliType]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="cli-type-tabs">
    <div class="tabs-wrapper">
      <button
        :class="['tab-btn', { active: currentCliType === 'claude' }]"
        @click="emit('change', 'claude')"
      >
        <EaIcon
          name="terminal"
          :size="16"
        />
        <span>{{ t('settings.providerSwitch.cliType.claude') }}</span>
      </button>
      <button
        :class="['tab-btn', { active: currentCliType === 'codex' }]"
        @click="emit('change', 'codex')"
      >
        <EaIcon
          name="code"
          :size="16"
        />
        <span>{{ t('settings.providerSwitch.cliType.codex') }}</span>
      </button>
      <button
        :class="['tab-btn', { active: currentCliType === 'opencode' }]"
        @click="emit('change', 'opencode')"
      >
        <EaIcon
          name="terminal"
          :size="16"
        />
        <span>{{ t('settings.providerSwitch.cliType.opencode') }}</span>
      </button>
    </div>
  </div>
</template>
<style scoped src="./ProviderSwitchTabs.css"></style>
