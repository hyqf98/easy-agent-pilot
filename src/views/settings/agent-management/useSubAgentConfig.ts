/** useSubAgentConfig — 设置页子代理管理标签页的 composable，按 CLI 类型加载/编辑/删除子代理委派配置。 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSubAgentStore, type SubAgent } from '@/stores/subAgent'
import { useNotificationStore } from '@/stores/notification'

/** CLI 类型标签页（仅 claude / opencode 支持子代理委派）。 */
export type SubAgentCliType = 'claude' | 'opencode'

/** 精简表单：仅名称 + 提示词。 */
export interface SubAgentFormState {
  id?: string
  name: string
  prompt: string
}

const emptyForm = (): SubAgentFormState => ({
  name: '',
  prompt: ''
})

/**
 * 子代理配置页 composable（Sidecar 模式）。
 *
 * - CLI 类型切换用 Tab 标签页（对齐 ProviderSwitchTabs 下划线风格），不用下拉框。
 * - 列表仅显示用户自建子代理（系统级隐藏）。
 * - 表单精简为「名称 + 提示词」。
 * - 新增「磁盘已有子代理」只读列表，按当前 CLI 类型扫描 `.claude/agents` / `.opencode/agents`。
 */
export function useSubAgentConfig() {
  const subAgentStore = useSubAgentStore()
  const notificationStore = useNotificationStore()
  const { t } = useI18n()

  const searchQuery = ref('')
  const isCreating = ref(false)
  const isSaving = ref(false)
  const selectedCliType = ref<SubAgentCliType>('claude')

  const form = reactive<SubAgentFormState>(emptyForm())

  const cliTypeOptions = computed<Array<{ value: SubAgentCliType; label: string }>>(() => [
    { value: 'claude', label: 'Claude' },
    { value: 'opencode', label: 'OpenCode' }
  ])

  /** 当前 CLI 类型的写盘目录预览。 */
  const writeTargetDir = computed(() =>
    selectedCliType.value === 'opencode' ? '.opencode/agents' : '.claude/agents'
  )

  const filteredSubAgents = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()
    const list = subAgentStore.userSubAgents
    if (!query) {
      return list
    }
    return list.filter(subAgent => {
      const haystack = [subAgent.name, subAgent.description, subAgent.prompt]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  })

  const selectedSubAgent = computed(() =>
    subAgentStore.getSubAgentById(subAgentStore.selectedSubAgentId)
  )

  function applySubAgentToForm(subAgent: SubAgent | null) {
    const next = subAgent
      ? {
          id: subAgent.id,
          name: subAgent.name,
          prompt: subAgent.prompt
        }
      : emptyForm()
    Object.assign(form, next)
  }

  function selectSubAgent(subAgentId: string) {
    isCreating.value = false
    subAgentStore.setSelectedSubAgent(subAgentId)
  }

  function handleCreate() {
    isCreating.value = true
    subAgentStore.setSelectedSubAgent(null)
    applySubAgentToForm(null)
  }

  function handleCopy(subAgent: SubAgent) {
    isCreating.value = true
    subAgentStore.setSelectedSubAgent(null)
    applySubAgentToForm(subAgent)
    form.id = undefined
    form.name = `${subAgent.name} ${t('settings.subAgents.duplicateSuffix')}`
  }

  async function handleSave() {
    if (!form.name.trim() || !form.prompt.trim()) {
      return
    }

    isSaving.value = true
    try {
      const payload = {
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        description: undefined,
        category: 'custom' as const,
        tags: [],
        recommendedScenes: [],
        tools: [],
        disallowedTools: [],
        model: undefined,
        permissionMode: undefined,
        maxTurns: undefined,
        isEnabled: true,
        sortOrder: 100
      }

      if (isCreating.value || !form.id) {
        const created = await subAgentStore.createSubAgent(payload)
        subAgentStore.setSelectedSubAgent(created.id)
        isCreating.value = false
      } else {
        const updated = await subAgentStore.updateSubAgent(form.id, payload)
        subAgentStore.setSelectedSubAgent(updated.id)
      }
      notificationStore.success(t('settings.subAgents.saveSuccess'))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      notificationStore.error(t('settings.subAgents.saveFailed'), msg)
    } finally {
      isSaving.value = false
    }
  }

  async function handleDelete(subAgent: SubAgent) {
    if (subAgent.isBuiltin || subAgent.isSystem) {
      return
    }
    const refs = await subAgentStore.countReferences(subAgent.id)
    const blocked = refs.plans > 0 || refs.tasks > 0 || refs.sessions > 0
    if (blocked) {
      window.alert(t('settings.subAgents.deleteBlocked', { ...refs }))
      return
    }
    if (!window.confirm(t('settings.subAgents.deleteConfirm', { name: subAgent.name }))) {
      return
    }
    await subAgentStore.deleteSubAgent(subAgent.id)
    handleCreate()
  }

  async function refreshDiskSubAgents() {
    // 保留空实现以兼容外部调用，磁盘只读列表已移除
  }

  function handleCliTypeChange(type: SubAgentCliType) {
    selectedCliType.value = type
  }

  watch(selectedSubAgent, subAgent => {
    applySubAgentToForm(subAgent)
  }, { immediate: true })

  onMounted(async () => {
    await subAgentStore.loadSubAgents(true)

    const initialSubAgent =
      subAgentStore.userSubAgents[0] || null
    if (initialSubAgent) {
      subAgentStore.setSelectedSubAgent(initialSubAgent.id)
    } else {
      handleCreate()
    }
  })

  return {
    searchQuery,
    isCreating,
    isSaving,
    form,
    selectedCliType,
    cliTypeOptions,
    writeTargetDir,
    filteredSubAgents,
    selectedSubAgent,
    subAgentStore,
    selectSubAgent,
    handleCreate,
    handleCopy,
    handleSave,
    handleDelete,
    handleCliTypeChange,
    refreshDiskSubAgents
  }
}
