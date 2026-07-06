/**
 * useRepoCreateModal — 新建记忆库仓库弹窗（RepoCreateModal）的视图层逻辑。
 *
 * 职责：
 * 1. 复用 useRepoModals 中的创建弹窗草稿态（draft / agentOptions / formatOptions）；
 * 2. 处理弹窗关闭事件；
 * 3. 校验名称非空并组装 CreateMemoryRepoInput，向父组件 emit submit。
 *
 * 不操作 DOM；模板所需字段、子组件与提交方法均通过返回值暴露。
 */
import { EaButton, EaInput, EaModal, EaSelect } from '@/components/common'
import { useRepoCreateModal as useRepoCreateModalState } from '../useRepoModals'
import type { CreateMemoryRepoInput } from '@/types/memoryRepo'

/** 组件 Props */
export interface RepoCreateModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 保存中（按钮 loading） */
  loading?: boolean
}

/** 组件 Emits */
export interface RepoCreateModalEmits {
  'update:visible': [value: boolean]
  submit: [input: CreateMemoryRepoInput]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface RepoCreateModalEmitFn {
  (e: 'update:visible', value: boolean): void
  (e: 'submit', input: CreateMemoryRepoInput): void
}

/**
 * RepoCreateModal 组件的 composable。
 * @param _props 组件 props（模板直接消费，逻辑内不使用）
 * @param emit   组件 emit 函数
 */
export function useRepoCreateModal(_props: RepoCreateModalProps, emit: RepoCreateModalEmitFn) {
  const { draft, agentOptions, formatOptions } = useRepoCreateModalState()

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
      format: draft.value.format,
      systemPrompt: draft.value.systemPrompt.trim() || undefined,
      agentId: draft.value.agentId || undefined,
      modelId: draft.value.modelId.trim() || undefined
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
    formatOptions,
    // 方法
    close,
    handleSubmit
  }
}
