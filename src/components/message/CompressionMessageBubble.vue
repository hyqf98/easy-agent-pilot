<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Message } from '@/stores/message'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { EaIcon } from '@/components/common'

const { t, locale } = useI18n()
const props = defineProps<{ message: Message }>()
const bubbleRef = ref<HTMLElement | null>(null)
const lockedWidth = ref<number | null>(null)
let resizeObserver: ResizeObserver | null = null

// 新结构下压缩元数据（原始消息数/token/策略等）不再折叠进 message.compressionMetadata。
// 当前仅依赖消息自身的 content 与时间戳；展开状态由组件本地维护。
const isExpanded = ref(false)
const bubbleStyle = computed(() => {
  if (!lockedWidth.value) {
    return undefined
  }

  return {
    width: `min(${lockedWidth.value}px, 100%)`
  }
})

// 格式化时间
const formattedTime = computed(() => {
  const stamp = props.message.createdAt
  if (!stamp) return ''
  const date = new Date(stamp)
  return date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
})

const syncCollapsedWidth = () => {
  const element = bubbleRef.value
  if (!element) {
    return
  }

  const nextWidth = Math.ceil(element.getBoundingClientRect().width)
  if (nextWidth > 0) {
    lockedWidth.value = nextWidth
  }
}

// 切换展开状态
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

onMounted(async () => {
  await nextTick()
  syncCollapsedWidth()

  if (typeof ResizeObserver === 'undefined' || !bubbleRef.value) {
    return
  }

  resizeObserver = new ResizeObserver(() => {
    if (!isExpanded.value) {
      syncCollapsedWidth()
    }
  })
  resizeObserver.observe(bubbleRef.value)
})

watch(isExpanded, async (expanded) => {
  if (expanded) {
    if (!lockedWidth.value) {
      await nextTick()
      syncCollapsedWidth()
    }
    return
  }

  await nextTick()
  syncCollapsedWidth()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="bubbleRef"
    class="compression-bubble"
    :style="bubbleStyle"
  >
    <!-- 压缩头部 -->
    <div class="compression-bubble__header">
      <div class="compression-bubble__icon">
        <EaIcon
          name="archive"
          :size="16"
        />
      </div>
      <div class="compression-bubble__title">
        {{ t('compression.summaryTitle') }}
      </div>
      <button
        class="compression-bubble__toggle"
        @click="toggleExpand"
      >
        <EaIcon
          :name="isExpanded ? 'chevron-up' : 'chevron-down'"
          :size="14"
        />
        {{ isExpanded ? t('compression.collapse') : t('compression.expand') }}
      </button>
    </div>

    <!-- 摘要内容 -->
    <div
      v-show="isExpanded"
      class="compression-bubble__content"
    >
      <MarkdownRenderer :content="message.content || ''" />
    </div>

    <!-- 压缩信息 -->
    <div class="compression-bubble__meta">
      <div class="compression-bubble__info">
        <span class="compression-bubble__info-item">
          <EaIcon
            name="clock"
            :size="12"
          />
          {{ formattedTime }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compression-bubble {
  display: flex;
  flex-direction: column;
  width: fit-content;
  max-width: min(40rem, 100%);
  background-color: var(--color-user-bubble-bg, var(--color-primary-light));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.compression-bubble__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
}

.compression-bubble__icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-accent-light), var(--color-accent));
  border-radius: var(--radius-md);
  color: white;
}

.compression-bubble__title {
  flex: 1;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.compression-bubble__toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: var(--spacing-1) var(--spacing-2);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  margin-left: auto;
}

.compression-bubble__toggle:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.compression-bubble__content {
  min-width: 0;
  max-width: 100%;
  padding: var(--spacing-3);
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 300px;
}

.compression-bubble__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-bg-secondary);
}

.compression-bubble__info {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-4);
}

.compression-bubble__info-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.compression-bubble__strategy {
  font-size: var(--font-size-xs);
  padding: var(--spacing-1) var(--spacing-2);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
}

.compression-bubble__strategy--trigger {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
}

.compression-bubble__tools {
  min-width: 0;
  max-width: 100%;
  padding: var(--spacing-3);
  border-top: 1px solid var(--color-border);
}

.compression-bubble__tools-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.compression-bubble__tools-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
}

.compression-bubble__tool-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-2);
  background-color: var(--color-surface);
  border-radius: var(--radius-sm);
}

.compression-bubble__tool-status {
  display: flex;
  align-items: center;
}

.compression-bubble__tool-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.compression-bubble__tool-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  background-color: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

@media (max-width: 768px) {
  .compression-bubble {
    max-width: 100%;
  }
}

.compression-bubble__no-tools {
  min-width: 0;
  max-width: 100%;
  padding: var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  text-align: center;
}

.compression-bubble__content :deep(*) {
  max-width: 100%;
}

.compression-bubble__content :deep(pre),
.compression-bubble__content :deep(table) {
  max-width: 100%;
  overflow-x: auto;
}

.compression-bubble__content :deep(code),
.compression-bubble__content :deep(p),
.compression-bubble__content :deep(li) {
  overflow-wrap: anywhere;
}
</style>
