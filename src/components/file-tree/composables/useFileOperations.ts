/**
 * 文件操作 Composable
 * 封装文件重命名、删除、移动等操作的逻辑
 */

import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type {
  FileOperationResult,
  RenameFileInput,
  MoveFileInput,
  BatchDeleteInput
} from '../types'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'

export function useFileOperations() {
  const notificationStore = useNotificationStore()

  /// 操作加载状态
  const loading = ref(false)

  /**
   * 重命名文件/文件夹
   */
  async function renameFile(oldPath: string, newName: string): Promise<FileOperationResult | null> {
    loading.value = true
    try {
      const input: RenameFileInput = { oldPath, newName }
      const result = await invoke<FileOperationResult>('rename_file', { input })

      if (!result.success && result.message) {
        notificationStore.error('重命名失败', result.message)
      }

      return result
    } catch (error) {
      console.error('Failed to rename file:', error)
      notificationStore.networkError(
        '重命名文件',
        getErrorMessage(error),
        async () => { await renameFile(oldPath, newName) }
      )
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 删除单个文件/文件夹
   */
  async function deleteFile(path: string): Promise<FileOperationResult | null> {
    loading.value = true
    try {
      const result = await invoke<FileOperationResult>('delete_file', { path })

      if (!result.success && result.message) {
        notificationStore.error('删除失败', result.message)
      }

      return result
    } catch (error) {
      console.error('Failed to delete file:', error)
      notificationStore.networkError(
        '删除文件',
        getErrorMessage(error),
        async () => { await deleteFile(path) }
      )
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 批量删除文件/文件夹
   */
  async function batchDeleteFiles(paths: string[]): Promise<FileOperationResult | null> {
    if (paths.length === 0) {
      return { success: true, message: undefined, newPath: undefined }
    }

    loading.value = true
    try {
      const input: BatchDeleteInput = { paths }
      const result = await invoke<FileOperationResult>('batch_delete_files', { input })

      if (!result.success && result.message) {
        notificationStore.error('批量删除失败', result.message)
      }

      return result
    } catch (error) {
      console.error('Failed to batch delete files:', error)
      notificationStore.networkError(
        '批量删除文件',
        getErrorMessage(error),
        async () => { await batchDeleteFiles(paths) }
      )
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 移动文件/文件夹
   */
  async function moveFile(sourcePath: string, targetPath: string): Promise<FileOperationResult | null> {
    loading.value = true
    try {
      const input: MoveFileInput = { sourcePath, targetPath }
      const result = await invoke<FileOperationResult>('move_file', { input })

      if (!result.success && result.message) {
        notificationStore.error('移动失败', result.message)
      }

      return result
    } catch (error) {
      console.error('Failed to move file:', error)
      notificationStore.networkError(
        '移动文件',
        getErrorMessage(error),
        async () => { await moveFile(sourcePath, targetPath) }
      )
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    renameFile,
    deleteFile,
    batchDeleteFiles,
    moveFile
  }
}
