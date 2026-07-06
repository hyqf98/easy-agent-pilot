<script setup lang="ts">
import { useModelManageModal } from './useModelManageModal'

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  EaButton,
  EaIcon,
  ModelEditModal,
  formatContextWindowCount,
  models,
  modelSearch,
  filteredModels,
  isLoading,
  isSyncing,
  showEditModal,
  editingModel,
  handleAdd,
  handleSync,
  handleEdit,
  handleDelete,
  handleSetDefault,
  handleEditComplete,
  handleClose
} = useModelManageModal(props, emit as unknown as (e: 'close') => void)
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
