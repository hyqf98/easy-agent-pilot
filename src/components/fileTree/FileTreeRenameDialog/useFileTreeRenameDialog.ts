import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileTreeNodeData } from '../types'

/**
 * 文件树重命名对话框组件
 */

export interface FileTreeRenameDialogProps {
  visible: boolean
  node: FileTreeNodeData | null
}

export interface FileTreeRenameDialogEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'confirm', oldPath: string, newName: string): void
  (event: 'cancel'): void
}

export function useFileTreeRenameDialog(props: FileTreeRenameDialogProps, emit: FileTreeRenameDialogEmits) {
  const { t } = useI18n()

  /// 输入值
  const inputValue = ref('')

  /// 输入框引用
  const inputRef = ref<{ focus: () => void; select: () => void } | null>(null)

  /// 错误信息
  const errorMessage = computed(() => {
    if (!inputValue.value.trim()) {
      return t('validation.nameRequired')
    }
    if (inputValue.value.trim() === props.node?.label) {
      return t('validation.nameUnchanged')
    }
    return null
  })

  /// 监听可见性变化，自动聚焦
  watch(() => props.visible, async (visible) => {
    if (visible && props.node) {
      inputValue.value = props.node.label
      await nextTick()
      // 聚焦并选中文本
      if (inputRef.value) {
        inputRef.value.focus()
        inputRef.value.select()
      }
    }
  })

  /// 关闭对话框
  const handleClose = () => {
    inputValue.value = ''
    emit('update:visible', false)
  }

  /// 处理确认
  const handleConfirm = () => {
    if (errorMessage.value || !props.node) return

    emit('confirm', props.node.key, inputValue.value.trim())
    handleClose()
  }

  /// 处理取消
  const handleCancel = () => {
    emit('cancel')
    handleClose()
  }

  /// 处理键盘事件
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return {
    t,
    inputValue,
    inputRef,
    errorMessage,
    handleConfirm,
    handleCancel,
    handleKeydown
  }
}
