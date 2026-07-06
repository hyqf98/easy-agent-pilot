import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { save } from '@tauri-apps/plugin-dialog'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useAgentStore } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
import { exportMemoryRepo } from '@/services/memoryRepo'
import { getErrorMessage } from '@/utils/api'

/** 仓库概览 Tab 逻辑：只读展示元数据 + 导出为标准 Skills 包。 */
export function useRepoOverviewTab() {
  const { t } = useI18n()
  const memoryRepoStore = useMemoryRepoStore()
  const agentStore = useAgentStore()
  const notificationStore = useNotificationStore()

  const repo = computed(() => memoryRepoStore.activeRepo)
  const isExporting = computed(() => false)

  const agentName = computed(() => {
    const id = repo.value?.agentId
    if (!id) return ''
    return agentStore.agents.find((a) => a.id === id)?.name ?? id
  })

  const formatLabel = computed(() => {
    switch (repo.value?.format) {
      case 'single':
        return '单文件 (index.md)'
      case 'skill':
      default:
        return '标准 Skills 包'
    }
  })

  const updatedText = computed(() => {
    if (!repo.value) return ''
    try {
      return new Date(repo.value.updatedAt).toLocaleString()
    } catch {
      return repo.value.updatedAt
    }
  })

  /** 导出仓库为标准 Skills 包：让用户选择目录，缺省名 = 仓库 slug。 */
  async function handleExport() {
    const current = repo.value
    if (!current) return
    try {
      // 让用户选择目标目录（save 作为目录选择器：传一个默认名）
      const target = await save({
        title: t('memoryRepo.exportTitle'),
        defaultPath: current.slug
      })
      // 用户取消时返回 null
      if (target === null) return

      // target 可能是文件路径（save 行为）；取其父目录作为仓库目录落点
      const targetDir = target.trim() === '' ? undefined : target
      const result = await exportMemoryRepo(current.id, targetDir)
      notificationStore.success(
        t('memoryRepo.exportDone'),
        `${result.fileCount} 个文件 → ${result.targetDir}`
      )
    } catch (error) {
      notificationStore.databaseError('导出记忆库', getErrorMessage(error))
    }
  }

  return {
    t,
    repo,
    agentName,
    formatLabel,
    updatedText,
    isExporting,
    handleExport
  }
}

