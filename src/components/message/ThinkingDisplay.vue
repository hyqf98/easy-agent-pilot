<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ thinking: string }>()
const { t } = useI18n()

// 折叠状态 - 默认收起
const isExpanded = ref(false)

// 切换展开状态
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="thinking-display">
    <!-- 思考头部 -->
    <div
      class="thinking-display__header"
      @click="toggleExpand"
    >
      <div class="thinking-display__header-left">
        <span class="thinking-display__icon">💭</span>
        <span class="thinking-display__title">{{ t('message.thinking') }}</span>
        <span class="thinking-display__badge">{{ t('message.thinking') }}</span>
      </div>
      <div class="thinking-display__header-right">
        <span class="thinking-display__toggle">
          {{ isExpanded ? t('message.collapse') : t('message.expand') }}
        </span>
        <span
          class="thinking-display__chevron"
          :class="{ 'thinking-display__chevron--expanded': isExpanded }"
        >▼</span>
      </div>
    </div>

    <!-- 思考内容 - 默认收起 -->
    <div
      v-show="isExpanded"
      class="thinking-display__content"
    >
      <div class="thinking-display__scroll">
        <pre class="thinking-display__text">{{ thinking }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-display {
  width: 100%;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(196, 181, 253, 0.15), rgba(221, 214, 254, 0.1));
  border: 1px solid rgba(167, 139, 250, 0.25);
  overflow: hidden;
  transition: all 0.3s ease;
}

.thinking-display:hover {
  border-color: rgba(167, 139, 250, 0.4);
}

.thinking-display__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-2) var(--spacing-3);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
}

.thinking-display__header:hover {
  background: rgba(196, 181, 253, 0.2);
}

.thinking-display__header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.thinking-display__icon {
  font-size: 14px;
  line-height: 1;
}

.thinking-display__title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

.thinking-display__badge {
  font-size: 10px;
  padding: 1px 6px;
  background: linear-gradient(135deg, #c4b5fd, #a78bfa);
  color: white;
  border-radius: var(--radius-sm);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.thinking-display__header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.thinking-display__toggle {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.thinking-display__chevron {
  font-size: 10px;
  color: var(--color-text-tertiary);
  transition: transform 0.2s ease;
}

.thinking-display__chevron--expanded {
  transform: rotate(180deg);
}

.thinking-display__content {
  border-top: 1px solid rgba(167, 139, 250, 0.15);
}

.thinking-display__scroll {
  max-height: calc(1.5em * 6 + var(--spacing-2) * 2); /* 6行高度 */
  overflow-y: auto;
  padding: var(--spacing-2) var(--spacing-3);
}

/* 自定义滚动条 */
.thinking-display__scroll::-webkit-scrollbar {
  width: 4px;
}

.thinking-display__scroll::-webkit-scrollbar-track {
  background: transparent;
}

.thinking-display__scroll::-webkit-scrollbar-thumb {
  background: rgba(167, 139, 250, 0.3);
  border-radius: 2px;
}

.thinking-display__scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(167, 139, 250, 0.5);
}

.thinking-display__text {
  margin: 0;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-secondary);
}

/* 暗色模式适配 */
:global([data-theme='dark']) .thinking-display,
:global(.dark) .thinking-display {
  background: linear-gradient(135deg, rgba(196, 181, 253, 0.1), rgba(221, 214, 254, 0.05));
  border-color: rgba(167, 139, 250, 0.2);
}

:global([data-theme='dark']) .thinking-display__header:hover,
:global(.dark) .thinking-display__header:hover {
  background: rgba(196, 181, 253, 0.15);
}
</style>
