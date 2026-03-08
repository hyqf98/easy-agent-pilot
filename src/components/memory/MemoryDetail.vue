<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryStore } from '@/stores/memory'
import { EaIcon } from '@/components/common'
import type { UserMemory } from '@/types/memory'

interface Props {
  memory: UserMemory
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const memoryStore = useMemoryStore()

const showCompressed = ref(Boolean(props.memory.isCompressed && props.memory.compressedContent))

watch(
  () => props.memory.id,
  () => {
    showCompressed.value = Boolean(props.memory.isCompressed && props.memory.compressedContent)
  }
)

const isCompressing = computed(() => memoryStore.isCompressing)
const canShowCompressed = computed(() => Boolean(props.memory.compressedContent))

const displayContent = computed(() => {
  if (showCompressed.value && props.memory.compressedContent) {
    return props.memory.compressedContent
  }
  return props.memory.content
})

const contentLabel = computed(() => {
  return showCompressed.value && props.memory.compressedContent
    ? t('memory.detail.compressedContent')
    : t('memory.detail.originalContent')
})

const sourceLabel = computed(() => {
  if (props.memory.sourceType === 'auto') return t('memory.sourceAuto')
  if (props.memory.sourceType === 'manual') return t('memory.sourceManual')
  return t('memory.sourceSkill')
})

const formattedCreatedAt = computed(() => new Date(props.memory.createdAt).toLocaleString())
const formattedUpdatedAt = computed(() => new Date(props.memory.updatedAt).toLocaleString())

function buildCompressedContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 240) return normalized
  return `${normalized.slice(0, 240)}...`
}

function handleClose() {
  emit('close')
}

function toggleContent() {
  if (!canShowCompressed.value) return
  showCompressed.value = !showCompressed.value
}

async function handleDelete() {
  if (!confirm(t('memory.detail.deleteConfirm'))) return
  const ok = await memoryStore.deleteMemory(props.memory.id)
  if (ok) {
    emit('close')
  }
}

async function handleCompress() {
  if (isCompressing.value) return
  if (!props.memory.content.trim()) return

  const compressed = buildCompressedContent(props.memory.content)
  const result = await memoryStore.compressMemory(
    props.memory.id,
    props.memory.content,
    compressed
  )

  if (result) {
    showCompressed.value = true
  }
}
</script>

<template>
  <div class="memory-detail">
    <div class="memory-detail__header">
      <h3 class="memory-detail__title">{{ memory.title }}</h3>
      <button class="memory-detail__close" :title="t('memory.detail.close')" @click="handleClose">
        <EaIcon name="x" :size="18" />
      </button>
    </div>

    <div class="memory-detail__meta">
      <div class="meta-item">
        <span class="meta-item__label">{{ t('memory.detail.source') }}</span>
        <span class="meta-item__value">{{ sourceLabel }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">{{ t('memory.detail.createdAt') }}</span>
        <span class="meta-item__value">{{ formattedCreatedAt }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">{{ t('memory.detail.updatedAt') }}</span>
        <span class="meta-item__value">{{ formattedUpdatedAt }}</span>
      </div>
    </div>

    <div class="memory-detail__content">
      <div class="content-header">
        <span class="content-label">{{ contentLabel }}</span>
        <button
          v-if="canShowCompressed"
          class="content-toggle"
          type="button"
          @click="toggleContent"
        >
          {{ showCompressed ? t('memory.detail.originalContent') : t('memory.detail.compressedContent') }}
        </button>
      </div>
      <p class="content-text">{{ displayContent }}</p>
    </div>

    <div class="memory-detail__tags">
      <span class="tags-label">{{ t('memory.detail.tags') }}</span>
      <div v-if="memory.tags && memory.tags.length > 0" class="tags-list">
        <span v-for="tag in memory.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <span v-else class="tags-empty">{{ t('memory.detail.noTags') }}</span>
    </div>

    <div class="memory-detail__actions">
      <button class="action-btn action-btn--primary" :disabled="isCompressing" @click="handleCompress">
        <EaIcon name="zap" :size="16" />
        {{ isCompressing ? t('memory.detail.compressing') : t('memory.detail.compress') }}
      </button>
      <button class="action-btn action-btn--danger" :disabled="isCompressing" @click="handleDelete">
        <EaIcon name="trash-2" :size="16" />
        {{ t('memory.detail.delete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.memory-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface, #fff);
}

.memory-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.memory-detail__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text-primary, #1e293b);
}

.memory-detail__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
}

.memory-detail__close:hover {
  background-color: var(--color-bg-secondary, #f1f5f9);
}

.memory-detail__meta {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  background-color: var(--color-bg-secondary, #f8fafc);
}

.meta-item {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.meta-item:last-child {
  margin-bottom: 0;
}

.meta-item__label {
  min-width: 90px;
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.meta-item__value {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.memory-detail__content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.content-label {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.content-toggle {
  border: none;
  background: transparent;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  font-size: 12px;
}

.content-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  color: var(--color-text-primary, #1e293b);
}

.memory-detail__tags {
  padding: 0 16px 16px;
}

.tags-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
}

.tags-empty {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.memory-detail__actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn--primary {
  background-color: #2563eb;
  color: #fff;
}

.action-btn--danger {
  background-color: #fee2e2;
  color: #dc2626;
}
</style>

