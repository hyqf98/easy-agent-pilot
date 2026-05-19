<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{
  sessionId: string | null | undefined
}>()

const emit = defineEmits<{
  executePlan: []
  cancelPlan: []
}>()

const { t } = useI18n()
const sessionStore = useSessionStore()

const isPlanMode = computed(() => {
  if (!props.sessionId) return false
  return sessionStore.isPlanMode(props.sessionId)
})

const handleExecutePlan = () => {
  emit('executePlan')
}

const handleCancelPlan = () => {
  emit('cancelPlan')
}
</script>

<template>
  <div
    v-if="isPlanMode"
    class="plan-mode-banner"
  >
    <div class="plan-mode-banner__info">
      <EaIcon
        name="eye"
        :size="14"
        class="plan-mode-banner__icon"
      />
      <span class="plan-mode-banner__label">{{ t('message.planModeBanner.title') }}</span>
      <span class="plan-mode-banner__hint">{{ t('message.planModeBanner.hint') }}</span>
    </div>
    <div class="plan-mode-banner__actions">
      <button
        type="button"
        class="plan-mode-banner__cancel"
        @click="handleCancelPlan"
      >
        <EaIcon
          name="x"
          :size="12"
        />
        <span>{{ t('message.planModeBanner.cancel') }}</span>
      </button>
      <button
        type="button"
        class="plan-mode-banner__execute"
        @click="handleExecutePlan"
      >
        <EaIcon
          name="play"
          :size="12"
        />
        <span>{{ t('message.planModeBanner.execute') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.plan-mode-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, #3b82f6 10%, var(--color-bg-secondary));
  border: 1px solid color-mix(in srgb, #3b82f6 24%, var(--color-border));
  margin-bottom: 6px;
}

.plan-mode-banner__info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.plan-mode-banner__icon {
  color: #3b82f6;
  flex-shrink: 0;
}

.plan-mode-banner__label {
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
  white-space: nowrap;
}

.plan-mode-banner__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-mode-banner__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.plan-mode-banner__cancel {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #ef4444 40%, var(--color-border));
  background: color-mix(in srgb, #ef4444 10%, var(--color-bg-primary));
  color: #dc2626;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}

.plan-mode-banner__cancel:hover {
  background: color-mix(in srgb, #ef4444 20%, var(--color-bg-primary));
  border-color: color-mix(in srgb, #ef4444 56%, var(--color-border));
}

.plan-mode-banner__execute {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #22c55e 40%, var(--color-border));
  background: color-mix(in srgb, #22c55e 14%, var(--color-bg-primary));
  color: #16a34a;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}

.plan-mode-banner__execute:hover {
  background: color-mix(in srgb, #22c55e 22%, var(--color-bg-primary));
  border-color: color-mix(in srgb, #22c55e 56%, var(--color-border));
}
</style>
