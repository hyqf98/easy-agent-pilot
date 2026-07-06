/** useRepoModals — 记忆库仓库创建/编辑弹窗共享的草稿态 composable，被两个弹窗组件复用以维护表单字段与选项。 */
import { computed, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import type {
  CreateMemoryRepoInput,
  CreateSkillReferenceInput,
  MemoryRepoFormat
} from '@/types/memoryRepo'

export interface RepoCreateDraft {
  name: string
  description: string
  format: MemoryRepoFormat
  systemPrompt: string
  agentId: string
  modelId: string
  references: CreateSkillReferenceInput[]
}

function emptyCreateDraft(): RepoCreateDraft {
  return {
    name: '',
    description: '',
    format: 'skill',
    systemPrompt: '',
    agentId: '',
    modelId: '',
    references: []
  }
}

/**
 * 创建仓库弹窗逻辑。
 *
 * 仓库文件结构由 AI/用户在文件管理中按需创建，创建时不再预置 scripts/assets 目录。
 */
export function useRepoCreateModal() {
  const agentStore = useAgentStore()

  const isVisible = ref(false)
  const isSubmitting = ref(false)
  const draft = ref<RepoCreateDraft>(emptyCreateDraft())

  const agentOptions = computed(() =>
    agentStore.agents.map((agent) => ({
      label: agent.name,
      value: agent.id
    }))
  )

  const formatOptions = [
    { label: '标准 Skills 包', value: 'skill' },
    { label: '单文件 (index.md)', value: 'single' }
  ]

  function open() {
    draft.value = emptyCreateDraft()
    isVisible.value = true
  }

  function close() {
    isVisible.value = false
  }

  function toCreateInput(): CreateMemoryRepoInput {
    return {
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || undefined,
      format: draft.value.format,
      systemPrompt: draft.value.systemPrompt.trim() || undefined,
      agentId: draft.value.agentId || undefined,
      modelId: draft.value.modelId.trim() || undefined,
      references: draft.value.references.length > 0 ? draft.value.references : undefined
    }
  }

  return {
    isVisible,
    isSubmitting,
    draft,
    agentOptions,
    formatOptions,
    open,
    close,
    toCreateInput
  }
}

/**
 * 编辑仓库弹窗逻辑（基于激活仓库预填）。
 *
 * 使用具体表单类型（字段非可选）以适配 EaSelect 的 modelValue 类型；提交时映射回
 * UpdateMemoryRepoInput。
 */
export function useRepoEditModal() {
  const agentStore = useAgentStore()
  const memoryRepoStore = useMemoryRepoStore()

  interface EditForm {
    name: string
    description: string
    systemPrompt: string
    agentId: string
    modelId: string
    internalToolsEnabled: boolean
    enabled: boolean
  }

  const isVisible = ref(false)
  const isSubmitting = ref(false)
  const draft = ref<EditForm>({
    name: '',
    description: '',
    systemPrompt: '',
    agentId: '',
    modelId: '',
    internalToolsEnabled: true,
    enabled: true
  })

  const agentOptions = computed(() =>
    agentStore.agents.map((agent) => ({
      label: agent.name,
      value: agent.id
    }))
  )

  function open() {
    const repo = memoryRepoStore.activeRepo
    if (!repo) return
    draft.value = {
      name: repo.name,
      description: repo.description ?? '',
      systemPrompt: repo.systemPrompt,
      agentId: repo.agentId ?? '',
      modelId: repo.modelId ?? '',
      internalToolsEnabled: repo.internalToolsEnabled,
      enabled: repo.enabled
    }
    isVisible.value = true
  }

  function close() {
    isVisible.value = false
  }

  return {
    isVisible,
    isSubmitting,
    draft,
    agentOptions,
    open,
    close
  }
}
