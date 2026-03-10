<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMemoryStore } from '@/stores/memory'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'

interface Props {
  selectedId?: string | null
}

defineProps<Props>()
const emit = defineEmits<{
  select: [categoryId: string | null]
}>()

const { t } = useI18n()
const memoryStore = useMemoryStore()

// 新建分类对话框
const createDialogVisible = ref(false)
const newCategoryName = ref('')
const newCategoryParentId = ref<string | null>(null)

// 分类树
const categories = computed(() => memoryStore.categoryTree)

// 统计信息
const stats = computed(() => memoryStore.stats)

// 按分类统计的记忆数量
const memoryCountByCategory = computed(() => {
  const counts = new Map<string | null, number>()
  if (stats.value?.byCategory) {
    for (const [categoryId, count] of stats.value.byCategory) {
      counts.set(categoryId, count)
    }
  }
  return counts
})

// 获取分类的记忆数量
function getMemoryCount(categoryId: string | null): number {
  if (categoryId === null) {
    return stats.value?.total ?? 0
  }
  return memoryCountByCategory.value.get(categoryId) ?? 0
}

// 选择分类
function handleSelect(categoryId: string | null) {
  emit('select', categoryId)
}

// 打开新建分类对话框
function openCreateDialog(parentId: string | null = null) {
  newCategoryName.value = ''
  newCategoryParentId.value = parentId
  createDialogVisible.value = true
}

// 创建分类
async function handleCreateCategory() {
  if (!newCategoryName.value.trim()) return

  await memoryStore.createCategory({
    name: newCategoryName.value.trim(),
    parentId: newCategoryParentId.value ?? undefined
  })

  createDialogVisible.value = false
  newCategoryName.value = ''
  newCategoryParentId.value = null
}

// 获取分类图标
function getCategoryIcon(icon?: string): string {
  return icon || 'folder'
}

// 获取分类颜色
function getCategoryColor(color?: string): string {
  return color || '#6b7280'
}

// 默认分类ID到国际化键的映射
const defaultCategoryI18nMap: Record<string, string> = {
  'cat-user-info': 'memory.userInfo',
  'cat-project': 'memory.projectMemory',
  'cat-skills': 'memory.skillsKnowledge',
  'cat-general': 'memory.generalMemory',
}

// 获取分类名称（支持国际化）
function getCategoryName(category: { id: string; name: string }): string {
  const i18nKey = defaultCategoryI18nMap[category.id]
  if (i18nKey) {
    return t(i18nKey)
  }
  return category.name
}
</script>

<template>
  <div class="category-tree">
    <!-- 头部 -->
    <div class="category-tree__header">
      <h3 class="category-tree__title">{{ t('memory.categoryTitle') }}</h3>
      <button
        class="category-tree__add-btn"
        :title="t('memory.newCategory')"
        @click="openCreateDialog()"
      >
        <EaIcon
          name="plus"
          :size="16"
        />
      </button>
    </div>

    <!-- 分类列表 -->
    <div class="category-tree__content">
      <!-- 全部记忆 -->
      <button
        :class="['category-item', 'category-item--all', { 'category-item--active': selectedId === null }]"
        @click="handleSelect(null)"
      >
        <EaIcon
          name="archive"
          :size="18"
          class="category-item__icon"
        />
        <span class="category-item__name">{{ t('memory.allMemories') }}</span>
        <span class="category-item__count">{{ getMemoryCount(null) }}</span>
      </button>

      <!-- 分隔线 -->
      <div class="category-divider" />

      <!-- 分类树 -->
      <div
        v-for="category in categories"
        :key="category.id"
        class="category-group"
      >
        <button
          :class="['category-item', { 'category-item--active': selectedId === category.id }]"
          @click="handleSelect(category.id)"
        >
          <EaIcon
            :name="getCategoryIcon(category.icon)"
            :size="18"
            class="category-item__icon"
            :style="{ color: getCategoryColor(category.color) }"
          />
          <span class="category-item__name">{{ getCategoryName(category) }}</span>
          <span class="category-item__count">{{ getMemoryCount(category.id) }}</span>
        </button>

        <!-- 子分类 -->
        <div
          v-if="category.children && category.children.length > 0"
          class="category-children"
        >
          <button
            v-for="child in category.children"
            :key="child.id"
            :class="['category-item', 'category-item--child', { 'category-item--active': selectedId === child.id }]"
            @click="handleSelect(child.id)"
          >
            <EaIcon
              :name="getCategoryIcon(child.icon)"
              :size="16"
              class="category-item__icon"
              :style="{ color: getCategoryColor(child.color) }"
            />
            <span class="category-item__name">{{ getCategoryName(child) }}</span>
            <span class="category-item__count">{{ getMemoryCount(child.id) }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 新建分类对话框 -->
    <div
      v-if="createDialogVisible"
      class="create-dialog-overlay"
      @click.self="createDialogVisible = false"
    >
      <div class="create-dialog">
        <h4 class="create-dialog__title">{{ t('memory.newCategory') }}</h4>
        <input
          v-model="newCategoryName"
          type="text"
          class="create-dialog__input"
          :placeholder="t('memory.categoryNamePlaceholder')"
          @keyup.enter="handleCreateCategory"
        />
        <div class="create-dialog__actions">
          <button
            class="btn btn--secondary"
            @click="createDialogVisible = false"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="btn btn--primary"
            :disabled="!newCategoryName.trim()"
            @click="handleCreateCategory"
          >
            {{ t('memory.createCategory') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-primary, #fff);
}

.category-tree__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.category-tree__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
}

.category-tree__add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-tree__add-btn:hover {
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.category-tree__content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background-color: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  gap: 10px;
}

.category-item:hover {
  background-color: var(--color-bg-secondary, #f1f5f9);
}

.category-item--active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.category-item--active:hover {
  background-color: var(--color-primary-light, #eff6ff);
}

.category-item__icon {
  flex-shrink: 0;
}

.category-item__name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-item--active .category-item__name {
  color: var(--color-primary, #3b82f6);
}

.category-item__count {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  background-color: var(--color-bg-secondary, #f1f5f9);
  padding: 2px 8px;
  border-radius: 10px;
}

.category-item--active .category-item__count {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.category-divider {
  height: 1px;
  background-color: var(--border-color, #e5e7eb);
  margin: 8px 12px;
}

.category-children {
  margin-left: 20px;
}

.category-item--child {
  padding: 8px 12px;
}

/* 创建对话框 */
.create-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.create-dialog {
  background-color: var(--bg-primary, #fff);
  border-radius: 12px;
  padding: 20px;
  width: 320px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.create-dialog__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--color-text-primary, #1e293b);
}

.create-dialog__input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}

.create-dialog__input:focus {
  border-color: var(--color-primary, #3b82f6);
}

.create-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn--secondary {
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.btn--secondary:hover {
  background-color: var(--color-bg-tertiary, #e2e8f0);
}

.btn--primary {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.btn--primary:hover {
  background-color: var(--color-primary-dark, #2563eb);
}

.btn--primary:disabled {
  background-color: var(--color-primary-light, #93c5fd);
  cursor: not-allowed;
}
</style>
