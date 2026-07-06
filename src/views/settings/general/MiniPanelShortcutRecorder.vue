<script setup lang="ts">
/**
 * MiniPanelShortcutRecorder — 迷你面板快捷键录制器骨架。
 * 仅做模板渲染与 composable 胶水连接，全部业务逻辑见 useMiniPanelShortcutRecorder.ts。
 */
import {
  useMiniPanelShortcutRecorder,
  type MiniPanelShortcutRecorderProps,
  type MiniPanelShortcutRecorderEmits
} from './useMiniPanelShortcutRecorder'

const props = defineProps<MiniPanelShortcutRecorderProps>()
const emit = defineEmits<MiniPanelShortcutRecorderEmits>()

const {
  EaButton,
  t,
  isRecording,
  recorderRef,
  captureHint,
  displayValue,
  recordingDisplayValue,
  statusText,
  statusClass,
  canEnableShortcutOverride,
  handleButtonClick,
  handleButtonKeydown,
  handleButtonKeyup,
  toggleRecording,
  resetShortcut,
  enableWindowsOverride
} = useMiniPanelShortcutRecorder(props, emit)
</script>

<template>
  <div class="shortcut-recorder">
    <div class="shortcut-recorder__controls">
      <button
        ref="recorderRef"
        type="button"
        class="shortcut-display"
        :class="{
          'shortcut-display--recording': isRecording,
          'shortcut-display--disabled': disabled
        }"
        :disabled="disabled"
        @click="handleButtonClick"
        @keydown="handleButtonKeydown"
        @keyup="handleButtonKeyup"
      >
        <span class="shortcut-display__value">
          {{ isRecording ? recordingDisplayValue : displayValue }}
        </span>
        <span
          v-if="isRecording"
          class="shortcut-display__pulse"
        />
      </button>

      <div class="shortcut-recorder__actions">
        <EaButton
          type="secondary"
          size="small"
          :disabled="disabled"
          @click="toggleRecording"
        >
          {{ isRecording ? t('settings.general.miniPanelShortcutCancel') : t('common.edit') }}
        </EaButton>
        <EaButton
          type="ghost"
          size="small"
          :disabled="disabled"
          @click="resetShortcut"
        >
          {{ t('settings.general.miniPanelShortcutReset') }}
        </EaButton>
      </div>
    </div>

    <p class="shortcut-recorder__hint">
      {{ isRecording ? captureHint : t('settings.general.miniPanelShortcutHint') }}
    </p>
    <p
      class="shortcut-status"
      :class="statusClass"
    >
      {{ statusText }}
    </p>
    <div
      v-if="canEnableShortcutOverride"
      class="shortcut-recorder__override"
    >
      <EaButton
        type="secondary"
        size="small"
        @click="enableWindowsOverride"
      >
        {{ t('settings.general.miniPanelShortcutEnableOverride') }}
      </EaButton>
      <p class="shortcut-recorder__override-text">
        {{ t('settings.general.miniPanelShortcutOverrideDesc') }}
      </p>
    </div>
  </div>
</template>
<style scoped src="./MiniPanelShortcutRecorder.css"></style>
