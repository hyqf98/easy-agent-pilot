<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMemoryStore } from '@/stores/memory'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import MemoryCard from './MemoryCard.vue'
import type { UserMemory } from '@/types/memory'

const emit = defineEmits<{
  memoryClick: [memory: UserMemory]
}>()

const { t } = useI18n()
const memoryStore = useMemoryStore()

// 搜索关键词
const searchKeyword = ref('')

// 筛选后的记忆
const filteredMemories = computed(() => {
  let memories = memoryStore.filteredMemories

  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase().trim()
    memories = memories.filter(
      (m) =>
        m.title.toLowerCase().includes(keyword) ||
        m.content.toLowerCase().includes(keyword)
    )
  }
  return memories
})

// 按会话分组的记忆
const memoriesBySession = computed(() => {
  const groups = new Map<string, UserMemory[]>()
  for (const memory of filteredMemories.value) {
    const sessionId = memory.sessionId ?? 'no-session'
    if (!groups.has(sessionId)) {
      groups.set(sessionId, [])
    }
    groups.get(sessionId)!.push(memory)
  }
  return groups
})

// 是否有选中的记忆
const hasSelection = computed(() => memoryStore.hasSelection)

// 选中的记忆数量
const selectedCount = computed(() => {
  return memoryStore.selectedMemoryIds.size
})

// 加载状态
const isLoading = computed(() => memoryStore.isLoading)

// 点击记忆
function handleMemoryClick(memory: UserMemory) {
  emit('memoryClick', memory)
}

// 切换选择
function handleToggleSelect(memoryId: string) {
  memoryStore.toggleMemorySelection(memoryId)
}

// 全选
function handleSelectAll() {
  memoryStore.toggleSelectAll()
}

// 清空选择
function handleClearSelection() {
  memoryStore.clearSelection()
}

// 批量删除
async function handleBatchDelete() {
  const selectedIds = Array.from(memoryStore.selectedMemoryIds)
  if (selectedIds.length > 0) {
    if (confirm(`确定要删除选中的 ${selectedIds.length} 条记忆吗？`)) {
      await memoryStore.batchDeleteMemories(selectedIds)
    }
  }
}

// 刷新
async function handleRefresh() {
  await memoryStore.loadMemories()
}
</script>

<template>
  <div class="memory-content-panel">
    <!-- 工具栏 -->
    <div class="content-panel__toolbar">
      <!-- 搜索框 -->
      <input
        v-model="searchKeyword"
        type="text"
        class="search-input"
        :placeholder="t('memory.searchPlaceholder')"
        :disabled="isLoading"
      />

      <!-- 操作按钮 -->
      <template v-if="hasSelection">
        <div class="selection-info">
          <span>{{ t('memory.selected', { count: selectedCount }) }}</span>
          <div class="selection-actions">
            <button
              class="toolbar__btn"
              @click="handleSelectAll"
            >
              {{ t('memory.selectAll') }}
            </button>
            <button
              class="toolbar__btn"
              @click="handleClearSelection"
            >
              {{ t('memory.clearSelection') }}
            </button>
            <button
              class="toolbar__btn toolbar__btn--danger"
              @click="handleBatchDelete"
            >
              {{ t('memory.deleteSelected') }}
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <button
          class="toolbar__btn"
          :title="t('memory.refresh')"
          @click="handleRefresh"
        >
          <EaIcon
            name="refresh-cw"
            :size="16"
          />
        </button>
      </template>
    </div>

    <!-- 内容区域 -->
    <div class="content-panel__body">
      <!-- 加载状态 -->
      <div
        v-if="isLoading"
        class="loading-state"
      >
        <EaIcon
          name="loader-2"
          :size="32"
          class="loading-spinner"
        />
        <p class="loading-state__text">{{ t('common.loading') }}</p>
      </div>

      <!-- 记忆列表 -->
      <div
        v-else-if="filteredMemories.length > 0"
        class="memory-list"
      >
        <!-- 按会话分组显示 -->
        <div
          v-for="[sessionId, memories] in memoriesBySession"
          :key="sessionId"
          class="memory-group"
        >
          <!-- 会话标题 -->
          <div class="memory-group__header">
            <EaIcon
              name="message-square"
              :size="16"
            />
            <span class="memory-group__title">
              {{ sessionId === 'no-session' ? t('memory.noSession') : sessionId }}
            </span>
            <span class="memory-group__count">{{ memories.length }}</span>
          </div>

          <!-- 记忆卡片 -->
          <div class="memory-group__content">
            <MemoryCard
              v-for="memory in memories"
              :key="memory.id"
              :memory="memory"
              @toggle-select="handleToggleSelect"
              @click="handleMemoryClick(memory)"
            />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-else
        class="empty-state"
      >
        <EaIcon
          name="inbox"
          :size="48"
          class="empty-state__icon"
        />
        <p class="empty-state__text">
          {{ t('memory.emptyTitle') }}
        </p>
        <p class="empty-state__hint">
          {{ t('memory.emptyHint') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-content-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface, #fff);
}

.content-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.15s ease;
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
}

.search-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

.search-input::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.toolbar__btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background-color: var(--color-surface-hover, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
}

.toolbar__btn:hover {
  background-color: var(--color-surface-active, #e2e8f0);
}

.toolbar__btn--danger {
  color: #dc2626;
}

.toolbar__btn--danger:hover {
  background-color: #fee2e2;
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background-color: var(--color-primary-light, #eff6ff);
  border-radius: 6px;
  color: var(--color-primary, #3b82f6);
  font-size: 13px;
  font-weight: 500;
}

.selection-actions {
  display: flex;
  gap: 4px;
}

.content-panel__body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #64748b);
  gap: 12px;
}

.loading-spinner {
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

.loading-state__text {
  margin: 0;
  font-size: 14px;
}

.memory-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.memory-group {
  margin-bottom: 24px;
}

.memory-group:last-child {
  margin-bottom: 0;
}

.memory-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--color-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 500;
}

.memory-group__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-group__count {
  background-color: var(--color-surface-hover, #f1f5f9);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  margin-left: 4px;
}

.memory-group__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary, #94a3b8);
  gap: 12px;
  padding: 40px;
}

.empty-state__icon {
  opacity: 0.5;
}

.empty-state__text {
  font-size: 16px;
  margin: 0;
}

.empty-state__hint {
  font-size: 14px;
  margin: 0;
  text-align: center;
}
</style>
