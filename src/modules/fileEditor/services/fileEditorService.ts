/** 文件编辑器与 Tauri 后端对接的薄封装：读取/写入项目文件、删除、重命名等文件 IO 服务。 */
import { invoke } from '@tauri-apps/api/core'
import type { FileContentPayload, ProjectFileContent } from '../types'

export async function readProjectFile(projectPath: string, filePath: string): Promise<ProjectFileContent> {
  return invoke<ProjectFileContent>('read_project_file', {
    projectPath,
    filePath
  })
}

export async function writeProjectFile(payload: FileContentPayload): Promise<void> {
  await invoke('write_project_file', {
    projectPath: payload.projectPath,
    filePath: payload.filePath,
    content: payload.content
  })
}

export async function deleteProjectFile(filePath: string): Promise<void> {
  await invoke('delete_file', {
    path: filePath
  })
}
