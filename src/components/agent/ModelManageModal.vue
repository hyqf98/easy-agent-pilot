<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  useAgentConfigStore,
  type AgentModelConfig
} from '@/stores/agentConfig'
import { useNotificationStore } from '@/stores/notification'
import { EaButton, EaIcon } from '@/components/common'
import { formatContextWindowCount } from '@/utils/contextWindow'
import ModelEditModal from './ModelEditModal.vue'

const agentConfigStore = useAgentConfigStore()
const notificationStore = useNotificationStore()

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  close: []
}>()

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
</script>

<template>
  <div class="model-manage-modal">
    <div class="modal-header">
      <h3 class="modal-title">
        模型管理
      </h3>
      <button
        class="modal-close"
        @click="handleClose"
      >
        <EaIcon
          name="x"
          :size="16"
        />
      </button>
    </div>

    <div class="modal-body">
      <!-- 操作栏 -->
      <div class="model-actions">
        <EaButton
          size="small"
          type="ghost"
          :loading="isSyncing"
          :disabled="isSyncing"
          title="通过 ACP 协议同步该 Agent 支持的模型清单"
          @click="handleSync"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
          />
          同步模型
        </EaButton>
        <EaButton
          size="small"
          @click="handleAdd"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
          添加模型
        </EaButton>
      </div>

      <!-- 模型列表 -->
      <div class="model-list">
        <div
          v-if="isLoading"
          class="loading-state"
        >
          <EaIcon
            name="loader"
            :size="24"
            class="spin"
          />
          加载中...
        </div>

        <div
          v-else-if="models.length === 0"
          class="empty-state"
        >
          <EaIcon
            name="inbox"
            :size="48"
          />
          <p>暂无模型配置</p>
          <p class="hint">
            点击"添加模型"手动配置模型名称
          </p>
        </div>

        <template v-else>
          <div class="model-search">
            <input
              v-model="modelSearch"
              type="text"
              class="model-search__input"
              placeholder="筛选模型名称…"
            >
          </div>

          <div
            v-if="filteredModels.length === 0"
            class="empty-state"
          >
            <p>无匹配模型</p>
          </div>

          <div
            v-else
            class="model-items"
          >
            <div
              v-for="model in filteredModels"
              :key="model.id"
              class="model-item"
              :class="{ 'is-default': model.isDefault, 'is-disabled': !model.enabled }"
            >
              <div class="model-info">
                <div class="model-name">
                  <span class="name">{{ model.displayName }}</span>
                  <span
                    v-if="model.isDefault"
                    class="badge default"
                  >默认</span>
                  <span
                    v-if="!model.enabled"
                    class="badge disabled"
                  >禁用</span>
                </div>
                <div class="model-id">
                  {{ model.modelId || `CLI 默认: ${model.displayName}` }}
                </div>
                <div class="model-meta">
                  上下文窗口 {{ formatContextWindowCount(model.contextWindow) }}
                </div>
              </div>

              <div class="model-actions-row">
                <button
                  v-if="!model.isDefault"
                  class="action-btn"
                  title="设为默认"
                  @click="handleSetDefault(model)"
                >
                  <EaIcon
                    name="star"
                    :size="14"
                  />
                </button>
                <button
                  class="action-btn"
                  title="编辑"
                  @click="handleEdit(model)"
                >
                  <EaIcon
                    name="pencil"
                    :size="14"
                  />
                </button>
                <button
                  class="action-btn danger"
                  title="删除"
                  @click="handleDelete(model)"
                >
                  <EaIcon
                    name="trash-2"
                    :size="14"
                  />
                </button>
              </div>
            </div>
          </div>
        </template>
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
<style scoped src="./ModelManageModal.css"></style>
