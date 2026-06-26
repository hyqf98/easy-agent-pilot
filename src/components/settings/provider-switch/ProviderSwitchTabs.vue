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

<style scoped>
.cli-type-tabs {
  margin-bottom: var(--spacing-3);
}

/* 次级 Tab：下划线风格，与外层胶囊 Tab 形成层级区分 */
.tabs-wrapper {
  display: inline-flex;
  gap: var(--spacing-1);
  border-bottom: 1px solid var(--workspace-border, var(--color-border));
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  margin-bottom: -1px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.tab-btn:hover {
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.tab-btn.active {
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-weight: var(--font-weight-semibold);
  border-bottom-color: var(--workspace-text-primary, var(--color-text-primary));
}
</style>
