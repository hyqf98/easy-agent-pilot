<script setup lang="ts">
import { computed } from 'vue'
import { useMemoryStore } from '@/stores/memory'
import { EaIcon } from '@/components/common'
import type { UserMemory } from '@/types/memory'

interface Props {
  memory: UserMemory
}

const props = defineProps<Props>()
const emit = defineEmits<{
  click: []
  toggleSelect: []
}>()

const memoryStore = useMemoryStore()

// 是否选中
const isSelected = computed(() => memoryStore.selectedMemoryIds.has(props.memory.id))

// 预览文本（截取前100字符）
const previewText = computed(() => {
  const content = props.memory.isCompressed && props.memory.compressedContent
    ? props.memory.compressedContent
    : props.memory.content
  return content.length > 100 ? content.slice(0, 100) + '...' : content
})

// 格式化时间
const formattedTime = computed(() => {
  const date = new Date(props.memory.createdAt)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${days}天前`
})

// 点击卡片
function handleClick() {
  emit('click')
}

// 切换选择状态
function handleToggleSelect(e: Event) {
  e.stopPropagation()
  emit('toggleSelect')
}
</script>

<template>
  <div
    :class="['memory-card', { 'memory-card--selected': isSelected }]"
    @click="handleClick"
  >
    <!-- 选择复选框 -->
    <div
      class="memory-card__checkbox"
      @click="handleToggleSelect"
    >
      <EaIcon
        v-if="isSelected"
        name="check"
        :size="14"
      />
    </div>

    <!-- 内容区域 -->
    <div class="memory-card__content">
      <!-- 标题 -->
      <div class="memory-card__header">
        <h4 class="memory-card__title">
          {{ memory.title }}
        </h4>
        <div class="memory-card__meta">
          <!-- 压缩状态 -->
          <span
            v-if="memory.isCompressed"
            class="memory-card__badge memory-card__badge--compressed"
          >
            已压缩
          </span>
          <!-- 来源类型 -->
          <span
            :class="['memory-card__badge', `memory-card__badge--${memory.sourceType}`]"
          >
            {{ memory.sourceType === 'auto' ? '自动采集' : memory.sourceType === 'manual' ? '手动创建' : 'Skill' }}
          </span>
        </div>
      </div>

      <!-- 预览内容 -->
      <p class="memory-card__preview">
        {{ previewText }}
      </p>

      <!-- 底部信息 -->
      <div class="memory-card__footer">
        <span class="memory-card__time">{{ formattedTime }}</span>
        <div
          v-if="memory.tags && memory.tags.length > 0"
          class="memory-card__tags"
        >
          <span
            v-for="tag in memory.tags.slice(0, 3)"
            :key="tag"
            class="memory-card__tag"
          >
            {{ tag }}
          </span>
          <span
            v-if="memory.tags.length > 3"
            class="memory-card__tag"
          >
            +{{ memory.tags.length - 3 }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-card {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  background-color: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.memory-card:hover {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.memory-card--selected {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-light, #eff6ff);
}

.memory-card__checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
  margin-right: 12px;
  transition: all 0.15s ease;
}

.memory-card__checkbox:hover {
  border-color: var(--color-primary, #3b82f6);
}

.memory-card--selected .memory-card__checkbox {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.memory-card__content {
  flex: 1;
  min-width: 0;
}

.memory-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.memory-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.memory-card__meta {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.memory-card__badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.memory-card__badge--compressed {
  background-color: #dcfce7;
  color: #16a34a;
}

.memory-card__badge--auto {
  background-color: #dbeafe;
  color: #2563eb;
}

.memory-card__badge--manual {
  background-color: #fef3c7;
  color: #a16207;
}

.memory-card__badge--skill {
  background-color: #fce7f3;
  color: #9f1239;
}

.memory-card__preview {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  margin: 0 0 8px 0;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.memory-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.memory-card__time {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.memory-card__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.memory-card__tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
}
</style>
