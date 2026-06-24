<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTypewriterText } from '@/composables/useTypewriterText'
import { EaIcon } from '@/components/common'

const props = withDefaults(defineProps<{
  thinking: string
  live?: boolean
  defaultExpanded?: boolean
}>(), {
  live: false,
  defaultExpanded: false
})
const { t } = useI18n()

const { displayedText } = useTypewriterText(
  toRef(props, 'thinking'),
  toRef(props, 'live'),
  { charsPerSecond: 120, maxChunkSize: 16 }
)

const isExpanded = ref(props.defaultExpanded)
const placeholderText = computed(() => props.live ? '正在思考...' : '')
const titleText = computed(() => props.live ? '正在思考' : '思考过程')

// 切换展开状态
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="thinking-display">
    <!-- 思考头部 -->
    <button
      class="thinking-display__header"
      type="button"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div class="thinking-display__header-left">
        <span class="thinking-display__icon">
          <EaIcon
            :name="props.live ? 'loader-circle' : 'brain'"
            :size="13"
          />
        </span>
        <span class="thinking-display__title">{{ titleText }}</span>
      </div>
      <div class="thinking-display__header-right">
        <span class="thinking-display__toggle">
          {{ isExpanded ? t('message.collapse') : t('message.expand') }}
        </span>
        <span
          class="thinking-display__chevron"
          :class="{ 'thinking-display__chevron--expanded': isExpanded }"
        >
          <EaIcon
            name="chevron-down"
            :size="12"
          />
        </span>
      </div>
    </button>

    <!-- 思考内容 - 默认收起 -->
    <div
      v-show="isExpanded"
      class="thinking-display__content"
    >
      <div class="thinking-display__scroll">
        <pre class="thinking-display__text">{{ displayedText || placeholderText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-display {
  align-self: flex-start;
  width: min(100%, var(--thinking-display-width, var(--timeline-entry-width, clamp(18rem, 40%, 34rem))));
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tool-call-bg, var(--color-surface)) 62%, transparent);
  border: 1px solid color-mix(in srgb, var(--tool-call-border, var(--workspace-border, var(--color-border))) 78%, transparent);
  overflow: hidden;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.thinking-display:hover {
  border-color: var(--tool-call-hover-border, var(--workspace-border-strong, var(--color-border)));
}

.thinking-display__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 5px 9px;
  border: 0;
  background: transparent;
  cursor: pointer;
  user-select: none;
  text-align: left;
  transition: background 0.2s ease;
}

.thinking-display__header:hover {
  background: var(--tool-call-header-hover, rgba(38, 38, 38, 0.04));
}

.thinking-display__header-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}

.thinking-display__header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex-shrink: 0;
}

.thinking-display__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tool-call-meta, var(--color-text-secondary));
}

.thinking-display__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--tool-call-name, var(--color-text-primary));
  min-width: 0;
}

.thinking-display__toggle {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.thinking-display__chevron {
  display: inline-flex;
  color: var(--tool-call-meta, var(--color-text-tertiary));
  transition: transform 0.2s ease;
}

.thinking-display__chevron--expanded {
  transform: rotate(180deg);
}

.thinking-display__content {
  width: 100%;
  box-sizing: border-box;
  border-top: 1px solid var(--tool-call-content-border, var(--workspace-border, var(--color-border)));
  max-height: min(320px, calc(var(--message-compact-max-height, 20rem) - 44px));
  overflow: hidden;
}

.thinking-display__scroll {
  width: 100%;
  max-height: min(320px, calc(var(--message-compact-max-height, 20rem) - 44px));
  overflow: auto;
  scrollbar-gutter: stable;
  padding: 7px 8px 8px;
  box-sizing: border-box;
}

/* 自定义滚动条 */
.thinking-display__scroll::-webkit-scrollbar {
  width: var(--scrollbar-size-thin);
}

.thinking-display__scroll::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.thinking-display__scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background-clip: padding-box;
}

.thinking-display__scroll::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.thinking-display__text {
  margin: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: var(--color-text-secondary);
}

/* 暗色模式适配 */
:global([data-theme='dark']) .thinking-display,
:global(.dark) .thinking-display {
  background: color-mix(in srgb, var(--tool-call-bg, rgba(255, 255, 255, 0.06)) 70%, transparent);
  border-color: color-mix(in srgb, var(--tool-call-border, rgba(255, 255, 255, 0.1)) 84%, transparent);
}

:global([data-theme='dark']) .thinking-display__header:hover,
:global(.dark) .thinking-display__header:hover {
  background: var(--tool-call-header-hover, rgba(255, 255, 255, 0.07));
}

:global([data-theme='dark']) .thinking-display__content,
:global(.dark) .thinking-display__content {
  border-top-color: rgba(34, 211, 238, 0.14);
}

:global([data-theme='dark']) .thinking-display__text,
:global(.dark) .thinking-display__text {
  color: #cbd5e1;
}
</style>
