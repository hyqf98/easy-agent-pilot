/** useCompressionConfirmDialog — CompressionConfirmDialog 组件的 composable，负责 Token 超限压缩确认弹窗的可见性与确认/取消交互。 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import { formatTokenCount } from '@/stores/token'
import type { TokenUsage } from '@/stores/token'
import type { CompressionStrategy } from '@/stores/token'

export interface CompressionConfirmDialogProps {
  visible: boolean
  tokenUsage: TokenUsage
  messageCount: number
  loading?: boolean
}

export interface CompressionConfirmDialogEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'confirm', strategy: CompressionStrategy): void
  (event: 'cancel'): void
}

export function useCompressionConfirmDialog(
  props: CompressionConfirmDialogProps,
  emit: CompressionConfirmDialogEmits
) {
  const { t } = useI18n()

  // 选中的压缩策略
  const selectedStrategy = ref<CompressionStrategy>('summary')

  // 策略选项
  const strategyOptions = computed(() => [
    {
      value: 'summary' as CompressionStrategy,
      label: t('compression.strategySummary'),
      description: t('compression.strategySummaryDesc'),
      icon: 'sparkles'
    },
    {
      value: 'simple' as CompressionStrategy,
      label: t('compression.strategySimple'),
      description: t('compression.strategySimpleDesc'),
      icon: 'trash'
    }
  ])

  // Token 使用百分比
  const usagePercentage = computed(() => props.tokenUsage.percentage.toFixed(1))

  // 关闭对话框
  const handleClose = () => {
    if (!props.loading) {
      emit('update:visible', false)
      emit('cancel')
    }
  }

  const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(handleClose)

  // 确认压缩
  const handleConfirm = () => {
    emit('confirm', selectedStrategy.value)
  }

  return {
    t,
    selectedStrategy,
    strategyOptions,
    usagePercentage,
    formatTokenCount,
    handleClose,
    handleOverlayPointerDown,
    handleOverlayClick,
    handleConfirm,
    EaIcon
  }
}
