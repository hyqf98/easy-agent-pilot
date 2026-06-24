<script setup lang="ts">
import { EaIcon } from '@/components/common'
import SettingsContent from './SettingsContent.vue'
import SettingsNav from './SettingsNav.vue'

interface Props {
  title: string
  backLabel?: string
  showBack?: boolean
  showFullscreen?: boolean
  showClose?: boolean
}

withDefaults(defineProps<Props>(), {
  backLabel: '',
  showBack: false,
  showFullscreen: false,
  showClose: false
})

defineEmits<{
  back: []
  fullscreen: []
  close: []
}>()
</script>

<template>
  <section class="settings-shell">
    <header class="settings-shell__header">
      <div class="settings-shell__left">
        <button
          v-if="showBack"
          class="settings-shell__button settings-shell__button--text"
          type="button"
          @click="$emit('back')"
        >
          <EaIcon
            name="arrow-left"
            :size="15"
          />
          <span>{{ backLabel }}</span>
        </button>
        <h1 class="settings-shell__title">
          {{ title }}
        </h1>
      </div>

      <div
        v-if="showFullscreen || showClose"
        class="settings-shell__actions"
      >
        <button
          v-if="showFullscreen"
          class="settings-shell__button"
          type="button"
          title="全屏打开设置"
          @click="$emit('fullscreen')"
        >
          <EaIcon
            name="maximize-2"
            :size="15"
          />
        </button>
        <button
          v-if="showClose"
          class="settings-shell__button"
          type="button"
          title="关闭设置"
          @click="$emit('close')"
        >
          <EaIcon
            name="x"
            :size="16"
          />
        </button>
      </div>
    </header>

    <div class="settings-shell__body">
      <SettingsNav />
      <SettingsContent />
    </div>
  </section>
</template>

<style scoped>
.settings-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  background: var(--workspace-stage-bg, var(--color-bg-secondary));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.settings-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-topbar-bg, var(--color-surface));
  flex-shrink: 0;
}

.settings-shell__left,
.settings-shell__actions,
.settings-shell__button {
  display: inline-flex;
  align-items: center;
}

.settings-shell__left {
  gap: 10px;
  min-width: 0;
}

.settings-shell__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-shell__actions {
  gap: 4px;
  flex-shrink: 0;
}

.settings-shell__button {
  justify-content: center;
  gap: 6px;
  height: 28px;
  min-width: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  font-size: 12px;
}

.settings-shell__button:hover {
  background: var(--workspace-control-hover-bg, var(--color-surface-hover));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.settings-shell__button--text {
  border-color: var(--workspace-control-border, var(--color-border));
  background: var(--workspace-control-bg, var(--color-surface));
}

.settings-shell__body {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
