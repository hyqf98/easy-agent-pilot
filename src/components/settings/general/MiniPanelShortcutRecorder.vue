<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton } from '@/components/common'
import { useMiniPanelShortcutState } from '@/composables/useMiniPanelShortcut'
import {
  buildShortcutFromKeyboardEvent,
  DEFAULT_MINI_PANEL_SHORTCUT,
  formatShortcutForDisplay,
  IS_WINDOWS,
  resolveMiniPanelShortcut,
  validateShortcutForCurrentPlatform
} from '@/utils/shortcut'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  windowsOverrideEnabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:windowsOverrideEnabled': [value: boolean]
}>()

const { t } = useI18n()
const { registrationState, registrationError, registrationMode } = useMiniPanelShortcutState()

const isRecording = ref(false)
const recorderRef = ref<HTMLButtonElement | null>(null)
const captureHint = ref('')

const displayValue = computed(() => formatShortcutForDisplay(props.modelValue))

const statusText = computed(() => {
  if (props.disabled) {
    return t('settings.general.miniPanelShortcutDisabled')
  }

  if (registrationState.value === 'registering') {
    return t('settings.general.miniPanelShortcutRegistering')
  }

  if (registrationState.value === 'error') {
    if (registrationError.value === 'GLOBAL_SHORTCUT_PERMISSION_REQUIRED') {
      return t('settings.general.miniPanelShortcutPermissionRequired')
    }

    if (registrationError.value === 'GLOBAL_SHORTCUT_RESERVED_WINDOWS_ALT_SPACE') {
      return t('settings.general.miniPanelShortcutReservedWindowsAltSpace')
    }

    if (registrationError.value === 'GLOBAL_SHORTCUT_CONFLICT') {
      return t('settings.general.miniPanelShortcutConflict')
    }

    if (registrationError.value === 'WINDOWS_SHORTCUT_OVERRIDE_UNSUPPORTED') {
      return t('settings.general.miniPanelShortcutOverrideUnsupported')
    }

    if (registrationError.value === 'WINDOWS_SHORTCUT_OVERRIDE_FAILED') {
      return t('settings.general.miniPanelShortcutOverrideFailed')
    }

    return registrationError.value || t('settings.general.miniPanelShortcutConflict')
  }

  if (registrationState.value === 'registered') {
    if (registrationMode.value === 'windows-override') {
      return t('settings.general.miniPanelShortcutRegisteredOverride', {
        shortcut: formatShortcutForDisplay(resolveMiniPanelShortcut(props.modelValue))
      })
    }

    return t('settings.general.miniPanelShortcutRegistered', {
      shortcut: formatShortcutForDisplay(resolveMiniPanelShortcut(props.modelValue))
    })
  }

  return t('settings.general.miniPanelShortcutReady')
})

const statusClass = computed(() => ({
  'shortcut-status--error': registrationState.value === 'error' && !props.disabled,
  'shortcut-status--active': registrationState.value === 'registered' && !props.disabled,
  'shortcut-status--muted': props.disabled || registrationState.value === 'idle'
}))

const canEnableWindowsOverride = computed(() => (
  IS_WINDOWS
  && !props.disabled
  && !props.windowsOverrideEnabled
  && registrationState.value === 'error'
  && (
    registrationError.value === 'GLOBAL_SHORTCUT_CONFLICT'
    || registrationError.value === 'GLOBAL_SHORTCUT_RESERVED_WINDOWS_ALT_SPACE'
  )
))

function stopRecording() {
  isRecording.value = false
  captureHint.value = ''
}

async function startRecording() {
  if (props.disabled) {
    return
  }

  isRecording.value = true
  captureHint.value = t('settings.general.miniPanelShortcutRecordingDesc')
  await nextTick()
  recorderRef.value?.focus()
}

function toggleRecording() {
  if (isRecording.value) {
    stopRecording()
    return
  }

  void startRecording()
}

function resetShortcut() {
  emit('update:modelValue', DEFAULT_MINI_PANEL_SHORTCUT)
  stopRecording()
}

function handleKeydown(event: KeyboardEvent) {
  if (!isRecording.value) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    stopRecording()
    return
  }

  const result = buildShortcutFromKeyboardEvent(event)
  if (result.accelerator) {
    const validationError = validateShortcutForCurrentPlatform(result.accelerator, {
      windowsOverrideEnabled: props.windowsOverrideEnabled
    })
    if (validationError === 'reserved-windows-alt-space') {
      captureHint.value = t('settings.general.miniPanelShortcutReservedWindowsAltSpace')
      return
    }

    emit('update:modelValue', result.accelerator)
    stopRecording()
    return
  }

  if (result.error === 'modifier-only') {
    captureHint.value = t('settings.general.miniPanelShortcutModifierOnly')
    return
  }

  captureHint.value = t('settings.general.miniPanelShortcutUnsupported')
}

function enableWindowsOverride() {
  emit('update:windowsOverrideEnabled', true)
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      stopRecording()
    }
  }
)

onMounted(() => {
  window.addEventListener('blur', stopRecording)
})

onUnmounted(() => {
  window.removeEventListener('blur', stopRecording)
})
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
        @click="toggleRecording"
        @keydown="handleKeydown"
      >
        <span class="shortcut-display__value">
          {{ isRecording ? t('settings.general.miniPanelShortcutRecording') : displayValue }}
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
      v-if="canEnableWindowsOverride"
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

<style scoped>
.shortcut-recorder {
  display: flex;
  min-width: 320px;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacing-2);
}

.shortcut-recorder__controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.shortcut-recorder__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.shortcut-display {
  position: relative;
  display: inline-flex;
  min-width: 180px;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast) var(--easing-default),
              box-shadow var(--transition-fast) var(--easing-default),
              background-color var(--transition-fast) var(--easing-default);
}

.shortcut-display:hover:not(:disabled) {
  border-color: var(--color-border-dark);
  background: var(--color-surface-hover);
}

.shortcut-display--recording {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.shortcut-display--disabled {
  opacity: 0.6;
}

.shortcut-display__value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.02em;
}

.shortcut-display__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: shortcut-pulse 1s ease-in-out infinite;
}

.shortcut-recorder__hint,
.shortcut-status {
  max-width: 320px;
  font-size: var(--font-size-xs);
  line-height: 1.5;
  text-align: right;
}

.shortcut-recorder__hint {
  color: var(--color-text-tertiary);
}

.shortcut-status {
  color: var(--color-text-secondary);
}

.shortcut-status--active {
  color: var(--color-success, #15803d);
}

.shortcut-status--error {
  color: var(--color-error, #dc2626);
}

.shortcut-status--muted {
  color: var(--color-text-tertiary);
}

.shortcut-recorder__override {
  display: flex;
  max-width: 320px;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacing-2);
}

.shortcut-recorder__override-text {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.5;
  text-align: right;
  color: var(--color-text-tertiary);
}

@keyframes shortcut-pulse {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.6;
  }

  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}
</style>
