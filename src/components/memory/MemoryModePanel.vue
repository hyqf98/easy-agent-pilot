<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useMemoryStore } from '@/stores/memory'
import { useI18n } from 'vue-i18n'
import CategoryTree from './CategoryTree.vue'
import MemoryContentPanel from './MemoryContentPanel.vue'
import MemoryDetail from './MemoryDetail.vue'
import type { UserMemory } from '@/types/memory'

const { t } = useI18n()
const memoryStore = useMemoryStore()

// 右侧详情面板
const detailPanelOpen = ref(false)
const selectedMemory = ref<UserMemory | null>(null)

// 当前选中的分类ID（null 表示全部）
const currentCategoryId = computed(() => memoryStore.currentCategoryId)

// 打开记忆详情
function handleMemoryClick(memory: UserMemory) {
  selectedMemory.value = memory
  detailPanelOpen.value = true
}

// 关闭详情面板
function closeDetailPanel() {
  detailPanelOpen.value = false
  selectedMemory.value = null
}

// 分类选择变化
function handleCategorySelect(categoryId: string | null) {
  memoryStore.setCurrentCategory(categoryId)
}

// 初始化加载数据
onMounted(async () => {
  await memoryStore.initialize()
})
</script>

<template>
  <div class="memory-mode-panel">
    <!-- 左侧：分类树 -->
    <div class="category-tree-container">
      <CategoryTree
        :selected-id="currentCategoryId"
        @select="handleCategorySelect"
      />
    </div>

    <!-- 中间：记忆列表 -->
    <div
      class="memory-content-container"
      :class="{ 'memory-content-container--with-detail': detailPanelOpen }"
    >
      <MemoryContentPanel @memory-click="handleMemoryClick" />
    </div>

    <!-- 收起按钮 - 放在交界处 -->
    <button
      v-if="detailPanelOpen"
      class="collapse-button"
      :title="t('common.collapse')"
      @click="closeDetailPanel"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>

    <!-- 右侧：记忆详情 -->
    <div
      v-if="detailPanelOpen && selectedMemory"
      class="memory-detail-container"
    >
      <MemoryDetail
        :memory="selectedMemory"
        @close="closeDetailPanel"
      />
    </div>
  </div>
</template>

<style scoped>
.memory-mode-panel {
  display: flex;
  height: 100%;
  background-color: var(--bg-primary, #fff);
  position: relative;
}

.category-tree-container {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #e5e7eb);
}

.memory-content-container {
  flex: 1;
  min-width: 0;
}

.memory-content-container--with-detail {
  border-right: 1px solid var(--border-color, #e5e7eb);
}

.collapse-button {
  position: absolute;
  right: 400px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-right: none;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  z-index: 10;
  color: var(--color-text-secondary, #64748b);
  transition: all 0.15s ease;
}

.collapse-button:hover {
  background-color: var(--color-bg-secondary, #f8fafc);
  color: var(--color-text-primary, #1e293b);
  width: 24px;
}

.collapse-button:active {
  width: 20px;
}

.memory-detail-container {
  width: 400px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color, #e5e7eb);
}
</style>
