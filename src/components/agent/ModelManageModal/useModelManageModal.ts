/**
 * useModelManageModal — Agent 模型管理弹窗的全部业务逻辑。
 *
 * 职责：
 * 1. 加载并展示指定 agent 的模型列表（支持按 displayName / modelId 模糊筛选）；
 * 2. 提供添加 / 编辑模型入口（打开 ModelEditModal 子组件）；
 * 3. 通过 ACP 协议从远端同步 Agent 支持的模型清单（按 modelId 去重合并）；
 * 4. 设置默认模型、删除模型、刷新列表；
 * 5. 完成编辑后 emit close / 重新加载列表。
 */
import { ref, computed, onMounted, watch } from 'vue'
import {
  useAgentConfigStore,
  type AgentModelConfig
} from '@/stores/agentConfig'
import { useNotificationStore } from '@/stores/notification'
import { EaButton, EaIcon } from '@/components/common'
import { formatContextWindowCount } from '@/utils/contextWindow'
import ModelEditModal from '@/components/agent/ModelEditModal/ModelEditModal.vue'

/** 组件 Props */
export interface ModelManageModalProps {
  agentId: string
}

/** 组件 Emits */
export interface ModelManageModalEmits {
  close: []
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface ModelManageModalEmitFn {
  (e: 'close'): void
}

/**
 * ModelManageModal 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useModelManageModal(
  props: ModelManageModalProps,
  emit: ModelManageModalEmitFn
) {
  const agentConfigStore = useAgentConfigStore()
  const notificationStore = useNotificationStore()

  const models = computed(() => agentConfigStore.getModelsConfigs(props.agentId))
  // 模型名称筛选（按 displayName / modelId 模糊匹配，不区分大小写）
  const modelSearch = ref('')
  const filteredModels = computed(() => {
    const keyword = modelSearch.value.trim().toLowerCase()
    if (!keyword) {
      return models.value
    }
    return models.value.filter(model =>
      (model.displayName || '').toLowerCase().includes(keyword)
      || (model.modelId || '').toLowerCase().includes(keyword)
    )
  })
  const isLoading = ref(false)
  const isSyncing = ref(false)

  const showEditModal = ref(false)
  const editingModel = ref<AgentModelConfig | null>(null)

  onMounted(async () => {
    await agentConfigStore.loadModelsConfigs(props.agentId)
  })

  watch(() => props.agentId, async (newAgentId) => {
    if (newAgentId) {
      await agentConfigStore.loadModelsConfigs(newAgentId)
    }
  })

  const handleAdd = () => {
    editingModel.value = null
    showEditModal.value = true
  }

  // 通过 ACP 协议拉取 Agent 支持的模型清单，与现有配置按 modelId 去重合并
  const handleSync = async () => {
    isSyncing.value = true
    try {
      const res = await agentConfigStore.syncModelsFromAgent(props.agentId)
      if (res.syncedCount > 0) {
        notificationStore.success(
          '同步完成',
          `新增 ${res.syncedCount} 个模型${res.skippedCount ? `，跳过 ${res.skippedCount} 个已存在` : ''}`
        )
      } else if (res.models.length === 0 && res.skippedCount === 0) {
        notificationStore.info('同步模型', '该 Agent 未返回模型清单（可能不支持）')
      } else {
        notificationStore.info('同步完成', `${res.skippedCount} 个模型均已存在，无新增`)
      }
    } catch {
      // store 内已通过 notificationStore.databaseError 提示
    } finally {
      isSyncing.value = false
    }
  }

  const handleEdit = (model: AgentModelConfig) => {
    editingModel.value = model
    showEditModal.value = true
  }

  const handleDelete = async (model: AgentModelConfig) => {
    try {
      await agentConfigStore.deleteModelConfig(model.id, props.agentId)
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  const handleSetDefault = async (model: AgentModelConfig) => {
    try {
      for (const m of models.value) {
        if (m.id !== model.id && m.isDefault) {
          await agentConfigStore.updateModelConfig(m.id, props.agentId, { isDefault: false })
        }
      }
      await agentConfigStore.updateModelConfig(model.id, props.agentId, { isDefault: true })
    } catch (error) {
      console.error('Failed to set default model:', error)
    }
  }

  const handleEditComplete = async () => {
    showEditModal.value = false
    editingModel.value = null
    await agentConfigStore.loadModelsConfigs(props.agentId)
  }

  const handleClose = () => {
    emit('close')
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    ModelEditModal,
    // 工具函数
    formatContextWindowCount,
    // 状态
    models,
    modelSearch,
    filteredModels,
    isLoading,
    isSyncing,
    showEditModal,
    editingModel,
    // 方法
    handleAdd,
    handleSync,
    handleEdit,
    handleDelete,
    handleSetDefault,
    handleEditComplete,
    handleClose
  }
}
