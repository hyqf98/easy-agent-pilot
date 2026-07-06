/** useRepoRunTab — 记忆库仓库「归纳」Tab 的 composable，输入指令以仓库为工作区跑 ACP agent 并流式展示输出。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useAgentStore } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
import { memoryRepoRunner } from '@/services/memory'
import { refreshProjectFileTreeView } from '@/components/fileTree'
import { getErrorMessage } from '@/utils/api'

/**
 * 仓库归纳（Run）Tab 逻辑：输入指令 → 以仓库目录为工作区跑 ACP agent，
 * 流式展示输出，结束后刷新文件树。
 */
export function useRepoRunTab() {
  const { t } = useI18n()
  const memoryRepoStore = useMemoryRepoStore()
  const agentStore = useAgentStore()
  const notificationStore = useNotificationStore()

  const instruction = ref('')
  const isRunning = ref(false)
  const output = ref('')
  const lastError = ref('')

  const activeRepo = computed(() => memoryRepoStore.activeRepo)
  const isReady = computed(
    () => !!activeRepo.value && !!activeRepo.value.agentId && instruction.value.trim().length > 0
  )

  /** 运行归纳。 */
  async function run() {
    const repo = activeRepo.value
    if (!repo || !repo.agentId) {
      notificationStore.warning('请先在仓库配置中绑定执行 Agent')
      return
    }
    const agent = agentStore.agents.find((a) => a.id === repo.agentId)
    if (!agent) {
      notificationStore.warning('绑定的 Agent 不可用')
      return
    }

    isRunning.value = true
    output.value = ''
    lastError.value = ''
    try {
      await memoryRepoRunner.run(
        { repo, agent, instruction: instruction.value.trim() },
        {
          onContent: (content) => {
            output.value = content
          },
          onError: (error) => {
            lastError.value = error
          }
        }
      )
      notificationStore.success('归纳完成')
      if (activeRepo.value) {
        await refreshProjectFileTreeView(activeRepo.value.id, activeRepo.value.repoPath)
      }
    } catch (error) {
      notificationStore.databaseError('仓库归纳失败', getErrorMessage(error))
    } finally {
      isRunning.value = false
    }
  }

  /** 使用预设指令快速启动。 */
  function applyPreset(text: string) {
    instruction.value = text
  }

  return {
    t,
    // state
    instruction,
    isRunning,
    output,
    lastError,
    // computed
    activeRepo,
    isReady,
    // actions
    run,
    applyPreset
  }
}
