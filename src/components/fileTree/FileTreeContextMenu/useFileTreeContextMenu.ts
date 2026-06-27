import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContextMenuContext } from '../types'

/**
 * 文件树右键菜单组件
 */

export interface FileTreeContextMenuProps {
  context: ContextMenuContext | null
}

export interface FileTreeContextMenuEmits {
  (event: 'createFile', node: ContextMenuContext['node']): void
  (event: 'createFolder', node: ContextMenuContext['node']): void
  (event: 'rename', node: ContextMenuContext['node']): void
  (event: 'delete', node: ContextMenuContext['node']): void
  (event: 'sendToSession', node: ContextMenuContext['node']): void
  (event: 'close'): void
}

export function useFileTreeContextMenu(props: FileTreeContextMenuProps, emit: FileTreeContextMenuEmits) {
  const { t } = useI18n()

  /// 菜单样式位置
  const menuStyle = computed(() => {
    if (!props.context) return {}
    return {
      left: `${props.context.position.x}px`,
      top: `${props.context.position.y}px`
    }
  })

  /// 是否显示菜单
  const visible = computed(() => props.context !== null)

  /// 节点类型
  const nodeType = computed(() => props.context?.node.nodeType)
  const isRoot = computed(() => props.context?.node.isRoot === true)

  /// 处理新建文件
  const handleCreateFile = () => {
    if (props.context) {
      emit('createFile', props.context.node)
    }
    emit('close')
  }

  /// 处理新建文件夹
  const handleCreateFolder = () => {
    if (props.context) {
      emit('createFolder', props.context.node)
    }
    emit('close')
  }

  /// 处理重命名
  const handleRename = () => {
    if (props.context) {
      emit('rename', props.context.node)
    }
    emit('close')
  }

  /// 处理删除
  const handleDelete = () => {
    if (props.context) {
      emit('delete', props.context.node)
    }
    emit('close')
  }

  /// 处理发送到会话
  const handleSendToSession = () => {
    if (props.context) {
      emit('sendToSession', props.context.node)
    }
    emit('close')
  }

  return {
    t,
    menuStyle,
    visible,
    nodeType,
    isRoot,
    handleCreateFile,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handleSendToSession
  }
}
