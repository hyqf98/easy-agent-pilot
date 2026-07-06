import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useProjectStore } from '@/stores/project'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import {
  parseMemoryRepoSourceConfig,
  type MemoryRepoSourceConfig
} from '@/types/memoryRepo'

/**
 * 数据源（Sources）Tab 逻辑：配置内置工具 query_conversation_history 的可见范围上界。
 *
 * 存储为 memory_repo_sources（sourceType=`conversation_history`）的 config JSON。
 * 字段：projectIds（白名单，空=不限）、since/until（时间窗）、maxLimit（返回上限）。
 */
export function useRepoSourcesTab() {
  const { t } = useI18n()
  const memoryRepoStore = useMemoryRepoStore()
  const projectStore = useProjectStore()
  const notificationStore = useNotificationStore()

  const selectedProjectIds = ref<string[]>([])
  const since = ref('')
  const until = ref('')
  const maxLimit = ref<number | ''>('')

  const activeRepo = computed(() => memoryRepoStore.activeRepo)
  const projectOptions = computed(() =>
    projectStore.projects.map((p) => ({ label: p.name, value: p.id }))
  )

  /** 当前仓库的 conversation_history 数据源配置（若存在）。 */
  const currentSource = computed(() =>
    memoryRepoStore.sources.find(
      (s) => s.sourceType === 'conversation_history' && s.enabled
    )
  )

  /** 用当前仓库的数据源配置回填表单。 */
  function hydrateFromSource() {
    const source = currentSource.value
    const config: MemoryRepoSourceConfig = source
      ? parseMemoryRepoSourceConfig(source.config)
      : {}
    selectedProjectIds.value = config.projectIds ?? []
    since.value = config.since ?? ''
    until.value = config.until ?? ''
    maxLimit.value = config.maxLimit ?? ''
  }

  async function save() {
    const repo = activeRepo.value
    if (!repo) return
    const config: MemoryRepoSourceConfig = {
      projectIds: selectedProjectIds.value.length > 0 ? selectedProjectIds.value : undefined,
      since: since.value.trim() || undefined,
      until: until.value.trim() || undefined,
      maxLimit: typeof maxLimit.value === 'number' ? maxLimit.value : undefined
    }
    try {
      await memoryRepoStore.upsertSource({
        repoId: repo.id,
        sourceType: 'conversation_history',
        config: JSON.stringify(config),
        enabled: true
      })
      notificationStore.success('已保存数据源范围')
    } catch (error) {
      notificationStore.databaseError('保存数据源', getErrorMessage(error))
    }
  }

  function clearAll() {
    selectedProjectIds.value = []
    since.value = ''
    until.value = ''
    maxLimit.value = ''
  }

  watch(currentSource, () => hydrateFromSource())

  onMounted(() => {
    hydrateFromSource()
    if (projectStore.projects.length === 0) {
      void projectStore.loadProjects()
    }
  })

  return {
    t,
    // state
    selectedProjectIds,
    since,
    until,
    maxLimit,
    // computed
    activeRepo,
    projectOptions,
    // actions
    save,
    clearAll
  }
}
