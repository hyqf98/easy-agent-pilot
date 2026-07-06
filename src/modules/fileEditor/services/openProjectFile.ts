/** 便捷入口：通过 fileEditor store 将项目文件在工作区中打开。 */
import { useFileEditorStore } from '../stores/fileEditor'
import type { FileEditorOpenInput } from '../types'
export async function openProjectFileInWorkspace(input: FileEditorOpenInput): Promise<boolean> {
  const fileEditorStore = useFileEditorStore()
  return fileEditorStore.openFile(input)
}
