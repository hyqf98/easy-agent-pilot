/** useEaLoadingOverlay — EaLoadingOverlay 全局加载遮罩组件的 composable，订阅全局加载态并派生标题、进度与可取消状态。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGlobalLoading } from '@/composables'
import EaButton from '../EaButton/EaButton.vue'
import EaIcon from '../EaIcon/EaIcon.vue'

/**
 * EaLoadingOverlay - 全局加载遮罩组件
 * 显示加载状态、进度条和取消按钮
 */

export interface EaLoadingOverlayProps {
  /** 自定义标题 */
  title?: string
  /** 自定义消息 */
  message?: string
  /** 进度 (0-100，-1 表示不确定进度) */
  progress?: number
  /** 是否可取消 */
  cancellable?: boolean
  /** 是否显示遮罩 */
  modelValue?: boolean
}

export interface EaLoadingOverlayEmits {
  (event: 'cancel'): void
  (event: 'update:modelValue', value: boolean): void
}

export function useEaLoadingOverlay(
  props: EaLoadingOverlayProps,
  emit: EaLoadingOverlayEmits
) {
  const { t } = useI18n()
  const { globalLoading, cancel: cancelLoading } = useGlobalLoading()

  // 计算是否显示
  const visible = computed(() => {
    if (props.modelValue !== undefined) {
      return props.modelValue
    }
    return globalLoading.value.visible
  })

  // 计算标题
  const displayTitle = computed(() => {
    if (props.title !== undefined) return props.title
    return globalLoading.value.title || t('common.loading')
  })

  // 计算消息
  const displayMessage = computed(() => {
    if (props.message !== undefined) return props.message
    return globalLoading.value.message
  })

  // 计算进度
  const displayProgress = computed(() => {
    if (props.progress !== undefined && props.progress >= 0) return props.progress
    return globalLoading.value.progress
  })

  // 是否显示进度条
  const showProgress = computed(() => displayProgress.value >= 0)

  // 是否显示进度百分比
  const showPercentage = computed(() => displayProgress.value >= 0 && displayProgress.value <= 100)

  // 是否可取消
  const isCancellable = computed(() => {
    if (props.cancellable !== undefined) return props.cancellable
    return globalLoading.value.cancellable
  })

  // 进度条样式
  const progressStyle = computed(() => ({
    width: `${Math.min(100, Math.max(0, displayProgress.value))}%`
  }))

  // 处理取消
  function handleCancel() {
    if (props.modelValue !== undefined) {
      emit('cancel')
      emit('update:modelValue', false)
    } else {
      cancelLoading()
    }
  }

  return {
    t,
    visible,
    displayTitle,
    displayMessage,
    displayProgress,
    showProgress,
    showPercentage,
    isCancellable,
    progressStyle,
    handleCancel,
    EaButton,
    EaIcon
  }
}
