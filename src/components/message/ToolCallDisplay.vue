<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall } from '@/stores/message'

const props = defineProps<{ toolCall: ToolCall }>()

// 折叠状态
const isExpanded = ref(false)
const isResultExpanded = ref(false)

// 结果内容是否过长（超过 500 字符）
const isResultLong = computed(() => {
  return (props.toolCall.result?.length ?? 0) > 500
})

// 参数 JSON 格式化
const formattedArguments = computed(() => {
  return JSON.stringify(props.toolCall.arguments, null, 2)
})

// 状态信息
const statusInfo = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return { text: '等待执行', icon: 'pending', class: 'status--pending' }
    case 'running':
      return { text: '执行中', icon: 'running', class: 'status--running' }
    case 'success':
      return { text: '执行成功', icon: 'success', class: 'status--success' }
    case 'error':
      return { text: '执行失败', icon: 'error', class: 'status--error' }
    default:
      return { text: '未知状态', icon: 'unknown', class: 'status--unknown' }
  }
})

// 截断的结果（用于折叠显示）
const truncatedResult = computed(() => {
  if (!props.toolCall.result) return ''
  if (props.toolCall.result.length <= 500) return props.toolCall.result
  return props.toolCall.result.slice(0, 500) + '...'
})

// 切换参数展开状态
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

// 切换结果展开状态
const toggleResultExpand = () => {
  isResultExpanded.value = !isResultExpanded.value
}
</script>

<template>
  <div class="tool-call">
    <!-- 工具调用头部 -->
    <div
      class="tool-call__header"
      @click="toggleExpand"
    >
      <div class="tool-call__header-left">
        <span class="tool-call__icon">
          <svg
            v-if="statusInfo.icon === 'pending'"
            class="status-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <svg
            v-else-if="statusInfo.icon === 'running'"
            class="status-icon status-icon--spinning"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <svg
            v-else-if="statusInfo.icon === 'success'"
            class="status-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <svg
            v-else-if="statusInfo.icon === 'error'"
            class="status-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <line
              x1="15"
              y1="9"
              x2="9"
              y2="15"
            />
            <line
              x1="9"
              y1="9"
              x2="15"
              y2="15"
            />
          </svg>
        </span>
        <span class="tool-call__name">{{ toolCall.name }}</span>
      </div>
      <div class="tool-call__header-right">
        <span :class="['tool-call__status', statusInfo.class]">
          {{ statusInfo.text }}
        </span>
        <svg
          class="tool-call__chevron"
          :class="{ 'tool-call__chevron--expanded': isExpanded }"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>

    <!-- 展开内容 -->
    <div
      v-if="isExpanded"
      class="tool-call__content"
    >
      <!-- 参数 -->
      <div class="tool-call__section">
        <div class="tool-call__section-title">
          参数
        </div>
        <pre class="tool-call__args">{{ formattedArguments }}</pre>
      </div>

      <!-- 结果 -->
      <div
        v-if="toolCall.result"
        class="tool-call__section"
      >
        <div class="tool-call__section-title">
          返回结果
        </div>
        <div class="tool-call__result-wrapper">
          <pre
            v-if="!isResultLong || isResultExpanded"
            class="tool-call__result"
          >{{ toolCall.result }}</pre>
          <pre
            v-else
            class="tool-call__result tool-call__result--truncated"
          >{{ truncatedResult }}</pre>
          <button
            v-if="isResultLong"
            class="tool-call__expand-btn"
            @click.stop="toggleResultExpand"
          >
            {{ isResultExpanded ? '收起' : '展开全部' }}
          </button>
        </div>
      </div>

      <!-- 错误信息 -->
      <div
        v-if="toolCall.errorMessage"
        class="tool-call__section tool-call__section--error"
      >
        <div class="tool-call__section-title tool-call__section-title--error">
          错误信息
        </div>
        <pre class="tool-call__error">{{ toolCall.errorMessage }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-call {
  margin: var(--spacing-2) 0;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: var(--font-size-sm);
}

.tool-call__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-2) var(--spacing-3);
  cursor: pointer;
  background-color: var(--color-bg-tertiary);
  transition: background-color 0.2s ease;
}

.tool-call__header:hover {
  background-color: var(--color-bg-secondary);
}

.tool-call__header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.tool-call__header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.tool-call__icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon {
  color: var(--color-text-tertiary);
}

.status-icon--spinning {
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

.tool-call__name {
  font-weight: var(--font-weight-medium);
  font-family: var(--font-family-mono);
  color: var(--color-text-primary);
}

.tool-call__status {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-secondary);
}

.tool-call__status.status--pending {
  color: var(--color-text-tertiary);
}

.tool-call__status.status--running {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.tool-call__status.status--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.tool-call__status.status--error {
  color: var(--color-error);
  background-color: var(--color-error-light);
}

.tool-call__chevron {
  color: var(--color-text-tertiary);
  transition: transform 0.2s ease;
}

.tool-call__chevron--expanded {
  transform: rotate(180deg);
}

.tool-call__content {
  padding: var(--spacing-3);
  border-top: 1px solid var(--color-border);
}

.tool-call__section {
  margin-bottom: var(--spacing-3);
}

.tool-call__section:last-child {
  margin-bottom: 0;
}

.tool-call__section-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-1);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tool-call__section-title--error {
  color: var(--color-error);
}

.tool-call__args,
.tool-call__result,
.tool-call__error {
  margin: 0;
  padding: var(--spacing-2);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-call__result--truncated {
  opacity: 0.8;
}

.tool-call__result-wrapper {
  position: relative;
}

.tool-call__expand-btn {
  margin-top: var(--spacing-1);
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  background: transparent;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-call__expand-btn:hover {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.tool-call__section--error {
  padding: var(--spacing-2);
  background-color: var(--color-error-light);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-error);
}

.tool-call__error {
  color: var(--color-error);
  background-color: transparent;
  padding: 0;
}
</style>
