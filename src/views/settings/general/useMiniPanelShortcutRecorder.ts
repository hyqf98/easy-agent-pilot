/**
 * useMiniPanelShortcutRecorder — 迷你面板快捷键录制器的全部业务逻辑。
 *
 * 职责：
 * 1. 管理「录制 / 就绪 / 注册中 / 已注册 / 错误」状态机，并对外暴露状态文本与样式类；
 * 2. 在 macOS 上调用原生捕获（capture_mini_panel_native_shortcut_once），
 *    在其他平台 / 兜底场景下通过全局 keydown/keyup 监听解析快捷键；
 * 3. 校验捕获到的快捷键（保留 Windows Alt+Space 等场景的拦截提示），
 *    并通过 update:modelValue / update:windowsOverrideEnabled 双向回写父组件；
 * 4. 在失焦、Escape、组件卸载等边界情况下安全终止录制。
 *
 * 注意：props（modelValue / disabled / windowsOverrideEnabled）由父组件传入，
 * 模板内直接通过 defineProps 暴露使用（如 disabled）；本 composable 仅消费 props 做逻辑判断。
 */
import { invoke } from '@tauri-apps/api/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton } from '@/components/common'
import { useMiniPanelShortcutState } from '@/composables/useMiniPanelShortcut'
import {
  buildShortcutFromKeyboardEvent,
  DEFAULT_MINI_PANEL_SHORTCUT,
  formatShortcutForDisplay,
  formatShortcutPreviewFromKeyboardEvent,
  IS_MAC,
  resolveMiniPanelShortcut,
  SUPPORTS_NATIVE_SHORTCUT_OVERRIDE,
  validateShortcutForCurrentPlatform
} from '@/utils/shortcut'

/** 组件 Props */
export interface MiniPanelShortcutRecorderProps {
  /** 当前绑定的快捷键（accelerator 字符串） */
  modelValue: string
  /** 是否禁用录制 */
  disabled?: boolean
  /** 是否已启用 Windows 原生覆盖（用于绕过系统占用） */
  windowsOverrideEnabled?: boolean
}

/** 组件 Emits */
export interface MiniPanelShortcutRecorderEmits {
  /** 同步快捷键字符串 */
  'update:modelValue': [value: string]
  /** 同步 Windows 原生覆盖开关 */
  'update:windowsOverrideEnabled': [value: boolean]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface MiniPanelShortcutRecorderEmitFn {
  /** 同步快捷键字符串 */
  (e: 'update:modelValue', value: string): void
  /** 同步 Windows 原生覆盖开关 */
  (e: 'update:windowsOverrideEnabled', value: boolean): void
}

/**
 * MiniPanelShortcutRecorder 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useMiniPanelShortcutRecorder(
  props: MiniPanelShortcutRecorderProps,
  emit: MiniPanelShortcutRecorderEmitFn
) {
  const { t } = useI18n()
  const { registrationState, registrationError, registrationMode } = useMiniPanelShortcutState()

  const isRecording = ref(false)
  const recorderRef = ref<HTMLButtonElement | null>(null)
  const captureHint = ref('')
  const recordingPreview = ref('')
  const suppressNextToggleUntil = ref(0)
  const nativeCaptureToken = ref(0)

  const displayValue = computed(() => formatShortcutForDisplay(props.modelValue))
  const recordingDisplayValue = computed(() => recordingPreview.value || t('settings.general.miniPanelShortcutRecording'))

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

      if (registrationError.value === 'NATIVE_SHORTCUT_OVERRIDE_UNSUPPORTED') {
        return t('settings.general.miniPanelShortcutOverrideUnsupported')
      }

      if (registrationError.value === 'NATIVE_SHORTCUT_OVERRIDE_FAILED') {
        return t('settings.general.miniPanelShortcutOverrideFailed')
      }

      if (registrationError.value === 'NATIVE_SHORTCUT_OVERRIDE_PERMISSION_REQUIRED') {
        return t('settings.general.miniPanelShortcutOverridePermissionRequired')
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

  const canEnableShortcutOverride = computed(() => (
    SUPPORTS_NATIVE_SHORTCUT_OVERRIDE
    && !props.disabled
    && !props.windowsOverrideEnabled
    && registrationState.value === 'error'
    && registrationError.value !== 'GLOBAL_SHORTCUT_PERMISSION_REQUIRED'
    && registrationError.value !== 'NATIVE_SHORTCUT_OVERRIDE_UNSUPPORTED'
    && registrationError.value !== 'NATIVE_SHORTCUT_OVERRIDE_FAILED'
    && registrationError.value !== 'NATIVE_SHORTCUT_OVERRIDE_PERMISSION_REQUIRED'
  ))

  /** 停止录制并清空预览（不回写值） */
  function stopRecording() {
    nativeCaptureToken.value += 1
    isRecording.value = false
    captureHint.value = ''
    recordingPreview.value = ''
  }

  /**
   * 应用捕获到的快捷键：先做平台校验，校验通过则回写父组件并终止录制。
   * @param shortcut 校验后的 accelerator 字符串
   */
  function applyCapturedShortcut(shortcut: string) {
    const validationError = validateShortcutForCurrentPlatform(shortcut, {
      windowsOverrideEnabled: props.windowsOverrideEnabled
    })
    if (validationError === 'reserved-windows-alt-space') {
      captureHint.value = t('settings.general.miniPanelShortcutReservedWindowsAltSpace')
      return
    }

    emit('update:modelValue', shortcut)
    suppressNextToggleUntil.value = Date.now() + 160
    stopRecording()
  }

  /**
   * 启动原生快捷键捕获（仅 macOS）。
   * 通过 captureToken 与当前 nativeCaptureToken 比对，丢弃过期的异步结果。
   * @param captureToken 本次捕获的会话令牌
   */
  async function startNativeCapture(captureToken: number) {
    try {
      const shortcut = await invoke<string>('capture_mini_panel_native_shortcut_once', {
        timeoutMs: 15000
      })

      if (!isRecording.value || captureToken !== nativeCaptureToken.value) {
        return
      }

      recordingPreview.value = formatShortcutForDisplay(shortcut)
      applyCapturedShortcut(shortcut)
    } catch (error) {
      if (!isRecording.value || captureToken !== nativeCaptureToken.value) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('MACOS_SHORTCUT_OVERRIDE_PERMISSION_REQUIRED')) {
        captureHint.value = t('settings.general.miniPanelShortcutOverridePermissionRequired')
        return
      }

      if (message.includes('MACOS_SHORTCUT_CAPTURE_CANCELLED')) {
        suppressNextToggleUntil.value = Date.now() + 160
        stopRecording()
        return
      }

      if (message.includes('MACOS_SHORTCUT_CAPTURE_TIMEOUT')) {
        captureHint.value = t('settings.general.miniPanelShortcutRecordingDesc')
        return
      }

      captureHint.value = t('settings.general.miniPanelShortcutUnsupported')
    }
  }

  /** 进入录制状态：聚焦按钮，并在 macOS 上发起原生捕获 */
  async function startRecording() {
    if (props.disabled) {
      return
    }

    isRecording.value = true
    captureHint.value = t('settings.general.miniPanelShortcutRecordingDesc')
    recordingPreview.value = ''
    await nextTick()
    recorderRef.value?.focus()

    if (IS_MAC) {
      const captureToken = nativeCaptureToken.value + 1
      nativeCaptureToken.value = captureToken
      void startNativeCapture(captureToken)
    }
  }

  /** 切换录制状态（带防抖，避免捕获后立刻被回切） */
  function toggleRecording() {
    if (Date.now() < suppressNextToggleUntil.value) {
      return
    }

    if (isRecording.value) {
      stopRecording()
      return
    }

    void startRecording()
  }

  /** 重置为默认快捷键并终止录制 */
  function resetShortcut() {
    emit('update:modelValue', DEFAULT_MINI_PANEL_SHORTCUT)
    stopRecording()
  }

  /** 录制期内的全局 keydown：解析快捷键或拦截非法输入 */
  function handleKeydown(event: KeyboardEvent) {
    if (!isRecording.value) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (event.key === 'Escape') {
      suppressNextToggleUntil.value = Date.now() + 300
      stopRecording()
      return
    }

    recordingPreview.value = formatShortcutPreviewFromKeyboardEvent(event)

    const result = buildShortcutFromKeyboardEvent(event)
    if (result.accelerator) {
      suppressNextToggleUntil.value = Date.now() + 500
      applyCapturedShortcut(result.accelerator)
      return
    }

    if (result.error === 'modifier-only') {
      captureHint.value = t('settings.general.miniPanelShortcutModifierOnly')
      return
    }

    captureHint.value = t('settings.general.miniPanelShortcutUnsupported')
  }

  /** 录制期内的全局 keyup：仅刷新预览 */
  function handleKeyup(event: KeyboardEvent) {
    if (!isRecording.value || event.key === 'Escape') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    recordingPreview.value = formatShortcutPreviewFromKeyboardEvent(event)
  }

  /** 录制按钮自身的 keydown：仅阻止默认行为 */
  function handleButtonKeydown(event: KeyboardEvent) {
    if (!isRecording.value) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  /** 录制按钮自身的 keyup：仅阻止默认行为 */
  function handleButtonKeyup(event: KeyboardEvent) {
    if (!isRecording.value) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  /** 录制按钮点击：录制中吞掉点击，否则切换录制 */
  function handleButtonClick(event: MouseEvent) {
    if (isRecording.value) {
      event.preventDefault()
      return
    }
    toggleRecording()
  }

  /** 启用 Windows 原生覆盖 */
  function enableWindowsOverride() {
    emit('update:windowsOverrideEnabled', true)
  }

  // 禁用时立即终止录制
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
    window.addEventListener('keydown', handleKeydown, true)
    window.addEventListener('keyup', handleKeyup, true)
  })

  onUnmounted(() => {
    window.removeEventListener('blur', stopRecording)
    window.removeEventListener('keydown', handleKeydown, true)
    window.removeEventListener('keyup', handleKeyup, true)
  })

  return {
    // 子组件
    EaButton,
    // i18n
    t,
    // 状态
    isRecording,
    recorderRef,
    captureHint,
    // 派生展示值
    displayValue,
    recordingDisplayValue,
    statusText,
    statusClass,
    canEnableShortcutOverride,
    // 方法
    handleButtonClick,
    handleButtonKeydown,
    handleButtonKeyup,
    toggleRecording,
    resetShortcut,
    enableWindowsOverride
  }
}
