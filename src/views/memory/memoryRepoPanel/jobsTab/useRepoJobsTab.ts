/**
 * useRepoJobsTab — 仓库定时任务（RepoJobsTab）Tab 的全部展示层逻辑。
 *
 * 职责：
 * 1. 任务列表加载 / 增删改 / 立即运行 / 运行历史；
 * 2. 监听 memory:job-trigger 事件，用 MemoryRepoRunner 执行到期任务并回写结果；
 * 3. 暴露模板所需的子组件、cron 预设、时间格式化与全部操作方法。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useAgentStore } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
import { refreshProjectFileTreeView } from '@/components/fileTree'
import { EaButton, EaIcon, EaInput, EaModal, EaSelect } from '@/components/common'
import { getErrorMessage } from '@/utils/api'
import {
  createMemoryJob,
  deleteMemoryJob,
  listMemoryJobs,
  listMemoryJobRuns,
  recordMemoryJobRun,
  triggerMemoryJob,
  updateMemoryJob
} from '@/services/memoryRepo'
import { memoryRepoRunner } from '@/services/memory'
import type {
  CreateMemoryJobInput,
  MemoryJob,
  MemoryJobRun,
  UpdateMemoryJobInput
} from '@/types/memoryRepo'

/** 具体表单类型（字段非可选，适配 EaSelect 的 modelValue 类型）。 */
interface JobForm {
  name: string
  instruction: string
  cron: string
  agentId: string
  modelId: string
}

/** cron 预设选项。 */
export const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: '每天 00:00', value: 'daily:00:00' },
  { label: '每天 12:00', value: 'daily:12:00' },
  { label: '每天 23:00', value: 'daily:23:00' },
  { label: '每周一 09:00', value: 'weekly:0-09:00' },
  { label: '一次性（手动触发）', value: '' }
]

/**
 * 仓库定时任务（Jobs）Tab 逻辑：列表 / 增删改 / 立即运行 / 历史。
 *
 * 监听 `memory:job-trigger` 事件（来自 memory_scheduler 到期触发或手动 trigger_memory_job），
 * 自动用 MemoryRepoRunner 执行任务并回写结果，形成调度闭环。
 */
export function useRepoJobsTab() {
  const { t } = useI18n()
  const memoryRepoStore = useMemoryRepoStore()
  const agentStore = useAgentStore()
  const notificationStore = useNotificationStore()

  const jobs = ref<MemoryJob[]>([])
  const runs = ref<MemoryJobRun[]>([])
  const isLoadingJobs = ref(false)
  const runningJobId = ref<string | null>(null)

  /** 编辑弹窗态（具体表单类型，字段非可选以适配 EaSelect 的 modelValue）。 */
  const isModalVisible = ref(false)
  const editingJob = ref<MemoryJob | null>(null)
  const draft = ref<JobForm>({
    name: '',
    instruction: '',
    cron: 'daily:00:00',
    agentId: '',
    modelId: ''
  })

  const activeRepo = computed(() => memoryRepoStore.activeRepo)
  const agentOptions = computed(() =>
    agentStore.agents.map((a) => ({ label: a.name, value: a.id }))
  )

  /** 格式化时间为本地可读字符串，空值返回「—」。 */
  function formatTime(value?: string): string {
    if (!value) return '—'
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  let unlisten: UnlistenFn | null = null

  async function loadJobs() {
    const repo = activeRepo.value
    if (!repo) {
      jobs.value = []
      return
    }
    isLoadingJobs.value = true
    try {
      jobs.value = await listMemoryJobs(repo.id)
    } catch (error) {
      notificationStore.networkError('加载定时任务', getErrorMessage(error))
    } finally {
      isLoadingJobs.value = false
    }
  }

  async function loadRuns(jobId: string) {
    try {
      runs.value = await listMemoryJobRuns(jobId)
    } catch (error) {
      notificationStore.networkError('加载运行历史', getErrorMessage(error))
    }
  }

  function openCreateModal() {
    editingJob.value = null
    draft.value = {
      name: '',
      instruction: '',
      cron: 'daily:00:00',
      agentId: activeRepo.value?.agentId ?? '',
      modelId: activeRepo.value?.modelId ?? ''
    }
    isModalVisible.value = true
  }

  function openEditModal(job: MemoryJob) {
    editingJob.value = job
    draft.value = {
      name: job.name,
      instruction: job.instruction,
      cron: job.cron ?? '',
      agentId: job.agentId ?? '',
      modelId: job.modelId ?? ''
    }
    isModalVisible.value = true
    void loadRuns(job.id)
  }

  function closeModal() {
    isModalVisible.value = false
  }

  async function handleSubmit() {
    const repo = activeRepo.value
    if (!repo) return
    const name = draft.value.name.trim()
    const instruction = draft.value.instruction.trim()
    if (!name || !instruction) return
    try {
      if (editingJob.value) {
        const input: UpdateMemoryJobInput = {
          name,
          instruction,
          cron: draft.value.cron || undefined,
          agentId: draft.value.agentId || undefined,
          modelId: draft.value.modelId || undefined
        }
        await updateMemoryJob(editingJob.value.id, input)
        notificationStore.success('已更新任务')
      } else {
        const input: CreateMemoryJobInput = {
          repoId: repo.id,
          name,
          instruction,
          cron: draft.value.cron || undefined,
          agentId: draft.value.agentId || undefined,
          modelId: draft.value.modelId || undefined
        }
        await createMemoryJob(input)
        notificationStore.success('已创建任务')
      }
      isModalVisible.value = false
      await loadJobs()
    } catch (error) {
      notificationStore.databaseError('保存任务', getErrorMessage(error))
    }
  }

  async function handleDelete(job: MemoryJob) {
    if (!window.confirm(`确定删除任务「${job.name}」吗？`)) return
    try {
      await deleteMemoryJob(job.id)
      await loadJobs()
      notificationStore.success('已删除任务')
    } catch (error) {
      notificationStore.databaseError('删除任务', getErrorMessage(error))
    }
  }

  /** 立即运行（触发后端 emit，监听器接管执行）。 */
  async function handleRunNow(job: MemoryJob) {
    try {
      await triggerMemoryJob(job.id)
    } catch (error) {
      notificationStore.databaseError('触发任务', getErrorMessage(error))
    }
  }

  /** 执行一个被触发的任务（来自调度器到期或手动触发）。 */
  async function executeTriggered(jobId: string) {
    const repo = memoryRepoStore.repos.find((r) => r.id === jobs.value.find((j) => j.id === jobId)?.repoId)
    const job = jobs.value.find((j) => j.id === jobId)
    if (!repo || !job) return

    const agentId = job.agentId ?? repo.agentId
    const agent = agentStore.agents.find((a) => a.id === agentId)
    if (!agent) {
      notificationStore.warning('任务缺少可用的执行 Agent')
      await recordMemoryJobRun({
        jobId,
        status: 'error',
        summary: '缺少可用的执行 Agent'
      }).catch(() => undefined)
      return
    }

    runningJobId.value = jobId
    try {
      const summary = await memoryRepoRunner.run({ repo, agent, instruction: job.instruction, modelId: job.modelId ?? repo.modelId })
      await recordMemoryJobRun({
        jobId,
        status: 'success',
        summary: summary.slice(0, 2000) || undefined
      })
      await refreshProjectFileTreeView(repo.id, repo.repoPath)
      await loadJobs()
    } catch (error) {
      const message = getErrorMessage(error)
      await recordMemoryJobRun({ jobId, status: 'error', summary: message }).catch(() => undefined)
      notificationStore.databaseError('执行定时任务', message)
    } finally {
      runningJobId.value = null
    }
  }

  onMounted(async () => {
    await loadJobs()
    unlisten = await listen<string>('memory:job-trigger', (event) => {
      if (event.payload) {
        void executeTriggered(event.payload)
      }
    })
  })

  onUnmounted(() => {
    unlisten?.()
  })

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaInput,
    EaModal,
    EaSelect,
    // 常量
    CRON_PRESETS,
    // i18n
    t,
    // state
    jobs,
    runs,
    isLoadingJobs,
    runningJobId,
    isModalVisible,
    editingJob,
    draft,
    // computed
    activeRepo,
    agentOptions,
    // 工具方法
    formatTime,
    // actions
    loadJobs,
    loadRuns,
    openCreateModal,
    openEditModal,
    closeModal,
    handleSubmit,
    handleDelete,
    handleRunNow,
    executeTriggered
  }
}
