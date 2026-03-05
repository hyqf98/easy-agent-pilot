<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  useAgentConfigStore,
  type AgentModelConfig
} from '@/stores/agentConfig'
import { useAgentStore } from '@/stores/agent'
import { EaButton, EaIcon } from '@/components/common'
import ModelEditModal from './ModelEditModal.vue'

const agentConfigStore = useAgentConfigStore()
const agentStore = useAgentStore()

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  close: []
}>()

// 状态
const models = computed(() => agentConfigStore.getModelsConfigs(props.agentId))
const isLoading = ref(false)
const isInitializing = ref(false)

// 获取当前智能体信息
const currentAgent = computed(() => {
  return agentStore.agents.find(a => a.id === props.agentId)
})

// 编辑弹窗状态
const showEditModal = ref(false)
const editingModel = ref<AgentModelConfig | null>(null)

// 初始化内置模型
const initBuiltinModelsIfNeeded = async () => {
  // 如果已经有模型配置，不需要初始化
  if (models.value.length > 0) return

  // 获取智能体的 provider
  const provider = currentAgent.value?.provider || 'claude'

  isInitializing.value = true
  try {
    await agentConfigStore.initBuiltinModels(props.agentId, provider)
  } catch (error) {
    console.error('Failed to initialize builtin models:', error)
  } finally {
    isInitializing.value = false
  }
}

// 组件挂载时检查是否需要初始化
onMounted(async () => {
  // 先加载模型配置
  await agentConfigStore.loadModelsConfigs(props.agentId)
  // 如果没有模型，初始化内置模型
  await initBuiltinModelsIfNeeded()
})

// 监听 agentId 变化
watch(() => props.agentId, async (newAgentId) => {
  if (newAgentId) {
    await agentConfigStore.loadModelsConfigs(newAgentId)
    await initBuiltinModelsIfNeeded()
  }
})

// 打开编辑弹窗
const handleAdd = () => {
  editingModel.value = null
  showEditModal.value = true
}

const handleEdit = (model: AgentModelConfig) => {
  editingModel.value = model
  showEditModal.value = true
}

// 删除模型
const handleDelete = async (model: AgentModelConfig) => {
  try {
    await agentConfigStore.deleteModelConfig(model.id, props.agentId)
  } catch (error) {
    console.error('Failed to delete model:', error)
  }
}

// 设置默认模型
const handleSetDefault = async (model: AgentModelConfig) => {
  try {
    // 先取消其他默认设置
    for (const m of models.value) {
      if (m.id !== model.id && m.isDefault) {
        await agentConfigStore.updateModelConfig(m.id, props.agentId, { isDefault: false })
      }
    }
    // 设置当前模型为默认
    await agentConfigStore.updateModelConfig(model.id, props.agentId, { isDefault: true })
  } catch (error) {
    console.error('Failed to set default model:', error)
  }
}

// 编辑完成回调
const handleEditComplete = async () => {
  showEditModal.value = false
  editingModel.value = null
  // 刷新模型列表
  await agentConfigStore.loadModelsConfigs(props.agentId)
}

// 关闭弹窗
const handleClose = () => {
  emit('close')
}
</script>

<template>
  <div class="model-manage-modal">
    <div class="modal-header">
      <h3 class="modal-title">模型管理</h3>
      <button class="modal-close" @click="handleClose">
        <EaIcon name="x" :size="16" />
      </button>
    </div>

    <div class="modal-body">
      <!-- 操作栏 -->
      <div class="model-actions">
        <EaButton size="small" @click="handleAdd">
          <EaIcon name="plus" :size="14" />
          添加模型
        </EaButton>
      </div>

      <!-- 模型列表 -->
      <div class="model-list">
        <div v-if="isLoading || isInitializing" class="loading-state">
          <EaIcon name="loader" :size="24" class="spin" />
          {{ isInitializing ? '正在初始化内置模型...' : '加载中...' }}
        </div>

        <div v-else-if="models.length === 0" class="empty-state">
          <EaIcon name="inbox" :size="48" />
          <p>暂无模型配置</p>
          <p class="hint">点击"添加模型"开始配置</p>
        </div>

        <div v-else class="model-items">
          <div
            v-for="model in models"
            :key="model.id"
            class="model-item"
            :class="{ 'is-default': model.isDefault, 'is-disabled': !model.enabled }"
          >
            <div class="model-info">
              <div class="model-name">
                <span class="name">{{ model.displayName }}</span>
                <span v-if="model.isBuiltin" class="badge builtin">内置</span>
                <span v-if="model.isDefault" class="badge default">默认</span>
                <span v-if="!model.enabled" class="badge disabled">禁用</span>
              </div>
              <div class="model-id">{{ model.modelId || '使用默认模型' }}</div>
            </div>

            <div class="model-actions-row">
              <button
                v-if="!model.isDefault"
                class="action-btn"
                title="设为默认"
                @click="handleSetDefault(model)"
              >
                <EaIcon name="star" :size="14" />
              </button>
              <button
                class="action-btn"
                title="编辑"
                @click="handleEdit(model)"
              >
                <EaIcon name="pencil" :size="14" />
              </button>
              <button
                v-if="!model.isBuiltin"
                class="action-btn danger"
                title="删除"
                @click="handleDelete(model)"
              >
                <EaIcon name="trash-2" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <ModelEditModal
      v-if="showEditModal"
      :agent-id="agentId"
      :model="editingModel"
      @close="handleEditComplete"
    />
  </div>
</template>

<style scoped>
.model-manage-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4) var(--spacing-5);
}

.model-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--spacing-4);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.empty-state .hint {
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-2);
}

.model-items {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3) var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  transition: all var(--transition-fast);
}

.model-item:hover {
  background-color: var(--color-surface-hover);
}

.model-item.is-default {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.model-item.is-disabled {
  opacity: 0.6;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-1);
}

.model-name .name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.model-name .badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.model-name .badge.builtin {
  background-color: var(--color-info-light);
  color: var(--color-info);
}

.model-name .badge.default {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.model-name .badge.disabled {
  background-color: var(--color-surface-hover);
  color: var(--color-text-tertiary);
}

.model-id {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: monospace;
}

.model-actions-row {
  display: flex;
  gap: var(--spacing-1);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.action-btn.danger:hover {
  color: var(--color-danger);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
