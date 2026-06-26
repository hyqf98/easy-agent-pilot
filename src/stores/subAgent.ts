import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { getErrorMessage } from '@/utils/api'

/**
 * 子代理分类（对齐内置子代理 seed 与设置页分组）。
 */
export type SubAgentCategory =
  | 'general'
  | 'planner'
  | 'architect'
  | 'developer'
  | 'tester'
  | 'writer'
  | 'designer'
  | 'reviewer'
  | 'ops'
  | 'custom'

/**
 * 子代理配置数据结构。
 *
 * 子代理是纯 persona 层（prompt + 工具约束），不再绑定 ACP 执行载体。
 * 执行器选择上移到会话/计划/SOLO 运行级别；软件经 ACP `_meta.systemPrompt`
 * 把子代理 prompt 自动注入给会话选定的执行器。
 *
 * `tools` / `disallowedTools` / `model` / `permissionMode` / `maxTurns`
 * 对齐 CLI 子代理 frontmatter，便于同步写盘成 `.claude/agents/*.md` 等配置。
 */
export interface SubAgent {
  id: string
  builtinCode?: string
  name: string
  description?: string
  prompt: string
  category: SubAgentCategory
  tags: string[]
  recommendedScenes: string[]
  /** 允许子代理使用的工具列表（写盘 frontmatter tools）。 */
  tools: string[]
  /** 禁止子代理使用的工具列表（写盘 frontmatter disallowedTools）。 */
  disallowedTools: string[]
  /** 子代理专用模型（写盘 frontmatter model），为空则沿用执行器默认模型。 */
  model?: string
  /** 权限模式（写盘 frontmatter permissionMode）。 */
  permissionMode?: string
  /** 最大交互轮数（写盘 frontmatter maxTurns）。 */
  maxTurns?: number
  isBuiltin: boolean
  /** 系统级子代理（内置 + 引擎 fallback 用），不显示在用户配置页。 */
  isSystem: boolean
  isEnabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type CreateSubAgentInput = Omit<
  SubAgent,
  'id' | 'builtinCode' | 'isBuiltin' | 'isSystem' | 'createdAt' | 'updatedAt'
>

export type UpdateSubAgentInput = Partial<CreateSubAgentInput>

export interface SubAgentReferenceSummary {
  plans: number
  tasks: number
  sessions: number
}

/**
 * 磁盘上的只读子代理（解析自 `.claude/agents/*.md` / `.opencode/agents/*.md`）。
 * 无 id，仅用于配置页展示 CLI 已有子代理，不可编辑。
 */
export interface DiskSubAgent {
  source: string
  fileName: string
  name: string
  description?: string
  prompt: string
  model?: string
  tools: string[]
}

export const useSubAgentStore = defineStore('subAgent', () => {
  const subAgents = ref<SubAgent[]>([])
  const isLoading = ref(false)
  const selectedSubAgentId = ref<string | null>(null)
  /** 磁盘上的只读子代理（按当前 CLI 类型加载）。 */
  const diskSubAgents = ref<DiskSubAgent[]>([])

  const enabledSubAgents = computed(() => subAgents.value.filter(subAgent => subAgent.isEnabled))
  /** 用户自建子代理（排除系统级），供配置页使用。 */
  const userSubAgents = computed(() => subAgents.value.filter(subAgent => !subAgent.isSystem))
  const selectedSubAgent = computed(
    () => subAgents.value.find(subAgent => subAgent.id === selectedSubAgentId.value) || null
  )

  function getBuiltinSubAgent(builtinCode: string) {
    return computed(
      () => subAgents.value.find(subAgent => subAgent.builtinCode === builtinCode) || null
    )
  }

  const builtinGeneralSubAgent = getBuiltinSubAgent('builtin-general')
  const builtinSoloCoordinatorSubAgent = getBuiltinSubAgent('builtin-solo-coordinator')
  const builtinPlannerSubAgent = getBuiltinSubAgent('builtin-planner')
  const builtinDeveloperSubAgent = getBuiltinSubAgent('builtin-developer')
  const builtinArchitectSubAgent = getBuiltinSubAgent('builtin-architect')
  const builtinTesterSubAgent = getBuiltinSubAgent('builtin-tester')
  const builtinWriterSubAgent = getBuiltinSubAgent('builtin-writer')
  const builtinDesignerSubAgent = getBuiltinSubAgent('builtin-designer')
  const builtinReviewerSubAgent = getBuiltinSubAgent('builtin-reviewer')
  const builtinOpsSubAgent = getBuiltinSubAgent('builtin-ops')

  async function loadSubAgents(force = false): Promise<SubAgent[]> {
    if (isLoading.value) {
      return subAgents.value
    }
    if (!force && subAgents.value.length > 0) {
      return subAgents.value
    }

    const notificationStore = useNotificationStore()
    isLoading.value = true
    try {
      await invoke('seed_builtin_sub_agents')
      subAgents.value = await invoke<SubAgent[]>('list_sub_agents')

      if (
        selectedSubAgentId.value &&
        !subAgents.value.some(subAgent => subAgent.id === selectedSubAgentId.value)
      ) {
        selectedSubAgentId.value = null
      }

      return subAgents.value
    } catch (error) {
      notificationStore.databaseError(
        '加载子代理失败',
        getErrorMessage(error),
        async () => {
          await loadSubAgents(true)
        }
      )
      subAgents.value = []
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function createSubAgent(input: CreateSubAgentInput): Promise<SubAgent> {
    const notificationStore = useNotificationStore()
    try {
      const subAgent = await invoke<SubAgent>('create_sub_agent', { input })
      subAgents.value = [subAgent, ...subAgents.value.filter(item => item.id !== subAgent.id)]
      return subAgent
    } catch (error) {
      notificationStore.databaseError('创建子代理失败', getErrorMessage(error))
      throw error
    }
  }

  async function updateSubAgent(id: string, updates: UpdateSubAgentInput): Promise<SubAgent> {
    const notificationStore = useNotificationStore()
    try {
      const subAgent = await invoke<SubAgent>('update_sub_agent', { id, input: updates })
      const index = subAgents.value.findIndex(item => item.id === id)
      if (index >= 0) {
        subAgents.value[index] = subAgent
      }
      return subAgent
    } catch (error) {
      notificationStore.databaseError('更新子代理失败', getErrorMessage(error))
      throw error
    }
  }

  async function countReferences(id: string): Promise<SubAgentReferenceSummary> {
    return invoke<SubAgentReferenceSummary>('count_sub_agent_references', { id })
  }

  async function deleteSubAgent(id: string): Promise<void> {
    const notificationStore = useNotificationStore()
    try {
      await invoke('delete_sub_agent', { id })
      subAgents.value = subAgents.value.filter(subAgent => subAgent.id !== id)
      if (selectedSubAgentId.value === id) {
        selectedSubAgentId.value = null
      }
    } catch (error) {
      notificationStore.databaseError('删除子代理失败', getErrorMessage(error))
      throw error
    }
  }

  function setSelectedSubAgent(id: string | null) {
    selectedSubAgentId.value = id
  }

  function getSubAgentById(id?: string | null): SubAgent | null {
    if (!id) return null
    return subAgents.value.find(subAgent => subAgent.id === id) || null
  }

  /**
   * 读取磁盘上已有的 CLI 子代理（只读）。
   * 扫描 `{project}/.claude/agents` 或 `{project}/.opencode/agents`，回退用户全局目录。
   */
  async function loadDiskSubAgents(cliType: string, projectPath?: string): Promise<DiskSubAgent[]> {
    const notificationStore = useNotificationStore()
    try {
      diskSubAgents.value = await invoke<DiskSubAgent[]>('list_disk_sub_agents', {
        input: { cliType, projectPath: projectPath || null }
      })
      return diskSubAgents.value
    } catch (error) {
      notificationStore.databaseError('读取磁盘子代理失败', getErrorMessage(error))
      diskSubAgents.value = []
      return []
    }
  }

  return {
    subAgents,
    enabledSubAgents,
    userSubAgents,
    diskSubAgents,
    isLoading,
    selectedSubAgentId,
    selectedSubAgent,
    builtinGeneralSubAgent,
    builtinSoloCoordinatorSubAgent,
    builtinPlannerSubAgent,
    builtinDeveloperSubAgent,
    builtinArchitectSubAgent,
    builtinTesterSubAgent,
    builtinWriterSubAgent,
    builtinDesignerSubAgent,
    builtinReviewerSubAgent,
    builtinOpsSubAgent,
    loadSubAgents,
    createSubAgent,
    updateSubAgent,
    countReferences,
    deleteSubAgent,
    setSelectedSubAgent,
    getSubAgentById,
    loadDiskSubAgents
  }
})
