<script setup lang="ts">
/** PlanModeBanner 组件：计划模式横幅，提示当前处于计划模式并提供执行/取消入口 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
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
      <EaButton
        type="secondary"
        size="small"
        @click="handleCancelPlan"
      >
        <EaIcon
          name="x"
          :size="12"
        />
        <span>{{ t('message.planModeBanner.cancel') }}</span>
      </EaButton>
      <EaButton
        type="primary"
        size="small"
        @click="handleExecutePlan"
      >
        <EaIcon
          name="play"
          :size="12"
        />
        <span>{{ t('message.planModeBanner.execute') }}</span>
      </EaButton>
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
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  margin-bottom: 6px;
}

.plan-mode-banner__info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.plan-mode-banner__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.plan-mode-banner__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
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
</style>
