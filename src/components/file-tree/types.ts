/**
 * 文件树组件类型定义
 */

/// 文件操作结果
export interface FileOperationResult {
  success: boolean
  message?: string
  newPath?: string
}

/// 文件树节点数据
export interface FileTreeNodeData {
  key: string
  label: string
  nodeType: 'file' | 'directory'
  extension?: string
  projectId: string
  isLeaf: boolean
}

/// 重命名文件输入
export interface RenameFileInput {
  oldPath: string
  newName: string
}

/// 移动文件输入
export interface MoveFileInput {
  sourcePath: string
  targetPath: string
}

/// 批量删除输入
export interface BatchDeleteInput {
  paths: string[]
}

/// 右键菜单位置
export interface ContextMenuPosition {
  x: number
  y: number
}

/// 右键菜单上下文
export interface ContextMenuContext {
  node: FileTreeNodeData
  position: ContextMenuPosition
}
