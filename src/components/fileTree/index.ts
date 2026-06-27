/**
 * 文件树组件导出
 */

// 组件
export { default as FileTree } from './FileTree/FileTree.vue'
export { default as FileTreeContextMenu } from './FileTreeContextMenu/FileTreeContextMenu.vue'
export { default as FileTreeCreateDialog } from './FileTreeCreateDialog/FileTreeCreateDialog.vue'
export { default as FileTreeRenameDialog } from './FileTreeRenameDialog/FileTreeRenameDialog.vue'

// Composables
export { useFileOperations } from './composables/useFileOperations'
export { refreshProjectFileTreeView } from './FileTree/useFileTree'

// 类型
export type {
  FileOperationResult,
  FileTreeNodeData,
  CreateEntryInput,
  CreateEntryType,
  RenameFileInput,
  MoveFileInput,
  BatchDeleteInput,
  ContextMenuPosition,
  ContextMenuContext
} from './types'
