/**
 * useRepoEditModal — 编辑记忆库仓库弹窗（RepoEditModal）的视图层逻辑。
 *
 * 职责：
 * 1. 复用 useRepoModals 中的编辑弹窗草稿态（draft / agentOptions）；
 * 2. 处理弹窗关闭事件；
 * 3. 校验名称非空并组装 UpdateMemoryRepoInput，向父组件 emit submit。
 *
 * 不操作 DOM；模板所需字段、子组件与提交方法均通过返回值暴露。
 */
import { EaButton, EaInput, EaModal, EaSelect } from '@/components/common'
import { useRepoEditModal as useRepoEditModalState } from '../useRepoModals'
import type { UpdateMemoryRepoInput } from '@/types/memoryRepo'

/** 组件 Props */
export interface RepoEditModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 保存中（按钮 loading） */
  loading?: boolean
}

/** 组件 Emits */
export interface RepoEditModalEmits {
  'update:visible': [value: boolean]
  submit: [input: UpdateMemoryRepoInput]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface RepoEditModalEmitFn {
  (e: 'update:visible', value: boolean): void
  (e: 'submit', input: UpdateMemoryRepoInput): void
}

/**
 * RepoEditModal 组件的 composable。
 * @param _props 组件 props（模板直接消费，逻辑内不使用）
 * @param emit   组件 emit 函数
 */
export function useRepoEditModal(_props: RepoEditModalProps, emit: RepoEditModalEmitFn) {
  const { draft, agentOptions } = useRepoEditModalState()

  /** 关闭弹窗 */
  function close() {
    emit('update:visible', false)
  }

  /** 校验名称非空并组装提交数据 */
  function handleSubmit() {
    const name = draft.value.name.trim()
    if (!name) return
    emit('submit', {
      name,
      description: draft.value.description.trim() || undefined,
      systemPrompt: draft.value.systemPrompt,
      agentId: draft.value.agentId || undefined,
      modelId: draft.value.modelId.trim() || undefined,
      internalToolsEnabled: draft.value.internalToolsEnabled,
      enabled: draft.value.enabled
    })
  }

  return {
    // 子组件
    EaButton,
    EaInput,
    EaModal,
    EaSelect,
    // 草稿与选项
    draft,
    agentOptions,
    // 方法
    close,
    handleSubmit
  }
}
