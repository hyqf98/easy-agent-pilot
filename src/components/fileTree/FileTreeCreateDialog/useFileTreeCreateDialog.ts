import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CreateEntryType, FileTreeNodeData } from '../types'

/**
 * 文件树新建条目对话框。
 * 根据目标节点推断创建位置，统一处理新建文件和新建文件夹。
 */

export interface FileTreeCreateDialogProps {
  visible: boolean
  node: FileTreeNodeData | null
  entryType: CreateEntryType
}

export interface FileTreeCreateDialogEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'confirm', node: FileTreeNodeData, name: string, entryType: CreateEntryType): void
  (event: 'cancel'): void
}

export function useFileTreeCreateDialog(props: FileTreeCreateDialogProps, emit: FileTreeCreateDialogEmits) {
  const { t } = useI18n()
  const inputValue = ref('')
  const inputRef = ref<{ focus: () => void; select: () => void } | null>(null)

  const title = computed(() => (
    props.entryType === 'directory' ? t('fileTree.createFolder') : t('fileTree.createFile')
  ))

  const placeholder = computed(() => (
    props.entryType === 'directory' ? t('fileTree.folderNamePlaceholder') : t('fileTree.fileNamePlaceholder')
  ))

  const errorMessage = computed(() => {
    if (!inputValue.value.trim()) {
      return t('validation.nameRequired')
    }
    if (/[\\/]/.test(inputValue.value.trim())) {
      return t('fileTree.invalidName')
    }
    return null
  })

  watch(() => props.visible, async (visible) => {
    if (!visible) {
      inputValue.value = ''
      return
    }

    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  })

  const handleClose = () => {
    inputValue.value = ''
    emit('update:visible', false)
  }

  const handleConfirm = () => {
    if (!props.node || errorMessage.value) {
      return
    }

    emit('confirm', props.node, inputValue.value.trim(), props.entryType)
    handleClose()
  }

  const handleCancel = () => {
    emit('cancel')
    handleClose()
  }

  return {
    t,
    inputValue,
    inputRef,
    title,
    placeholder,
    errorMessage,
    handleConfirm,
    handleCancel
  }
}
