<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  useAgentConfigStore,
  type AgentModelConfig
} from '@/stores/agentConfig'
import { EaButton, EaIcon } from '@/components/common'
import { formatContextWindowCount } from '@/utils/contextWindow'
import ModelEditModal from './ModelEditModal.vue'

const agentConfigStore = useAgentConfigStore()

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const models = computed(() => agentConfigStore.getModelsConfigs(props.agentId))
const isLoading = ref(false)

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

        <div
          v-else
          class="model-items"
        >
          <div
            v-for="model in models"
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
