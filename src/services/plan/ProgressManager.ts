/**
 * 进度文件管理器
 * 负责管理任务执行进度的读写
 */

import type { TaskStatus, ProgressFile } from '@/types/plan'
import { invoke } from '@tauri-apps/api/core'

// 进度文件存储目录
const PROGRESS_DIR = 'progress'

/**
 * 进度管理器类
 */
export class ProgressManager {
  private cache: Map<string, ProgressFile> = new Map()

  /**
   * 获取进度文件路径
   */
  getProgressFilePath(planId: string, taskId: string): string {
    return `${PROGRESS_DIR}/${planId}/${taskId}.json`
  }

  /**
   * 创建空的进度文件
   */
  createEmptyProgress(planId: string, taskId: string): ProgressFile {
    return {
      planId,
      taskId,
      status: 'pending',
      summary: '',
      lastUpdated: new Date().toISOString(),
      artifacts: [],
      notes: ''
    }
  }

  /**
   * 读取进度文件
   */
  async readProgress(planId: string, taskId: string): Promise<ProgressFile | null> {
    const cacheKey = `${planId}/${taskId}`

    // 检查缓存
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    try {
      const filePath = this.getProgressFilePath(planId, taskId)
      const content = await invoke<string>('read_file_content', { path: filePath })
      const progress = JSON.parse(content) as ProgressFile

      // 更新缓存
      this.cache.set(cacheKey, progress)

      return progress
    } catch (error) {
      console.error('Failed to read progress file:', error)
      return null
    }
  }

  /**
   * 写入进度文件
   */
  async writeProgress(progress: ProgressFile): Promise<boolean> {
    const cacheKey = `${progress.planId}/${progress.taskId}`

    try {
      progress.lastUpdated = new Date().toISOString()

      const filePath = this.getProgressFilePath(progress.planId, progress.taskId)
      const content = JSON.stringify(progress, null, 2)

      await invoke('write_file_content', {
        path: filePath,
        content
      })

      // 更新缓存
      this.cache.set(cacheKey, progress)

      return true
    } catch (error) {
      console.error('Failed to write progress file:', error)
      return false
    }
  }

  /**
   * 更新进度摘要
   */
  async updateSummary(
    planId: string,
    taskId: string,
    summary: string
  ): Promise<boolean> {
    const progress = await this.readProgress(planId, taskId)
    if (!progress) {
      return false
    }

    progress.summary = summary
    return this.writeProgress(progress)
  }

  /**
   * 更新任务状态
   */
  async updateStatus(
    planId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<boolean> {
    const progress = await this.readProgress(planId, taskId)
    if (!progress) {
      return false
    }

    progress.status = status
    return this.writeProgress(progress)
  }

  /**
   * 添加产出文件
   */
  async addArtifact(
    planId: string,
    taskId: string,
    artifactPath: string
  ): Promise<boolean> {
    const progress = await this.readProgress(planId, taskId)
    if (!progress) {
      return false
    }

    if (!progress.artifacts.includes(artifactPath)) {
      progress.artifacts.push(artifactPath)
    }

    return this.writeProgress(progress)
  }

  /**
   * 移除产出文件
   */
  async removeArtifact(
    planId: string,
    taskId: string,
    artifactPath: string
  ): Promise<boolean> {
    const progress = await this.readProgress(planId, taskId)
    if (!progress) {
      return false
    }

    progress.artifacts = progress.artifacts.filter(a => a !== artifactPath)

    return this.writeProgress(progress)
  }

  /**
   * 添加备注
   */
  async addNote(
    planId: string,
    taskId: string,
    note: string
  ): Promise<boolean> {
    const progress = await this.readProgress(planId, taskId)
    if (!progress) {
      return false
    }

    const timestamp = new Date().toISOString()
    progress.notes += `\n[${timestamp}] ${note}`

    return this.writeProgress(progress)
  }

  /**
   * 初始化进度文件
   */
  async initProgress(planId: string, taskId: string): Promise<ProgressFile> {
    const progress = this.createEmptyProgress(planId, taskId)
    await this.writeProgress(progress)
    return progress
  }

  /**
   * 删除进度文件
   */
  async deleteProgress(planId: string, taskId: string): Promise<boolean> {
    const cacheKey = `${planId}/${taskId}`

    try {
      // 这里需要调用 Tauri 命令删除文件
      // 暂时只清除缓存
      this.cache.delete(cacheKey)
      return true
    } catch (error) {
      console.error('Failed to delete progress file:', error)
      return false
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存的进度
   */
  getCachedProgress(planId: string, taskId: string): ProgressFile | undefined {
    return this.cache.get(`${planId}/${taskId}`)
  }
}

// 导出单例实例
export const progressManager = new ProgressManager()
