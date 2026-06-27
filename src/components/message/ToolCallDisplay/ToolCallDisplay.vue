<script setup lang="ts">
import { EaIcon } from '@/components/common'
import { useToolCallDisplay, type ToolCallDisplayProps } from './useToolCallDisplay'

const props = withDefaults(defineProps<ToolCallDisplayProps>(), {
  live: false,
  compact: false,
  defaultExpanded: undefined,
  defaultResultExpanded: undefined
})

const {
  t,
  isExpanded,
  isResultExpanded,
  toggleExpand,
  toggleResultExpand,
  statusClass,
  statusIcon,
  toolIcon,
  isTerminalLikeTool,
  isAgentExecutionTool,
  agentExecutionTitle,
  animatedArguments,
  animatedResult,
  toolSummary
} = useToolCallDisplay(props)
</script>

<template>
  <div
    class="tool-call"
    :class="[statusClass, { 'tool-call--compact': compact, 'tool-call--agent-run': isAgentExecutionTool }]"
  >
    <!-- 工具调用头部 -->
    <button
      type="button"
      class="tool-call__header"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div class="tool-call__header-left">
        <span class="tool-call__icon">
          <EaIcon
            :name="isAgentExecutionTool ? 'workflow' : toolIcon"
            :size="13"
          />
        </span>
        <span
          v-if="isAgentExecutionTool"
          class="tool-call__agent-label"
        >子代理执行</span>
        <span class="tool-call__name">{{ isAgentExecutionTool ? agentExecutionTitle : toolCall.name }}</span>
        <span
          class="tool-call__status"
          :class="`tool-call__status--${toolCall.status}`"
        >
          <EaIcon
            :name="statusIcon"
            :size="12"
          />
        </span>
      </div>
      <div class="tool-call__header-right">
        <span class="tool-call__summary">{{ toolSummary }}</span>
        <span class="tool-call__toggle">
          {{ isExpanded ? t('message.collapse') : t('message.expand') }}
        </span>
        <span
          class="tool-call__chevron"
          :class="{ 'tool-call__chevron--expanded': isExpanded }"
        >
          <EaIcon
            name="chevron-down"
            :size="12"
          />
        </span>
      </div>
    </button>

    <!-- 工具调用内容 -->
    <div
      v-show="isExpanded"
      class="tool-call__content"
    >
      <!-- 参数 -->
      <div class="tool-call__section">
        <div class="tool-call__section-title">
          <EaIcon
            name="log-in"
            :size="12"
          />
          <span>{{ t('message.parameters') }}</span>
        </div>
        <pre class="tool-call__code">{{ animatedArguments }}</pre>
      </div>

      <!-- 结果 -->
      <div
        v-if="toolCall.result"
        class="tool-call__section"
      >
        <button
          type="button"
          class="tool-call__section-header"
          @click.stop="toggleResultExpand"
        >
          <div class="tool-call__section-title">
            <EaIcon
              :name="isAgentExecutionTool ? 'scroll-text' : 'log-out'"
              :size="12"
            />
            <span>{{ isAgentExecutionTool ? '执行日志' : t('message.result') }}</span>
          </div>
          <div class="tool-call__section-toggle">
            <span>{{ isResultExpanded ? t('message.collapse') : t('message.expand') }}</span>
            <span
              class="tool-call__chevron"
              :class="{ 'tool-call__chevron--expanded': isResultExpanded }"
            >
              <EaIcon
                name="chevron-down"
                :size="12"
              />
            </span>
          </div>
        </button>
        <div
          v-show="isResultExpanded"
          class="tool-call__result"
        >
          <pre
            class="tool-call__code tool-call__result-content"
            :class="{ 'tool-call__code--terminal': isTerminalLikeTool }"
          >{{ animatedResult }}</pre>
        </div>
      </div>

      <!-- 错误信息 -->
      <div
        v-if="toolCall.errorMessage"
        class="tool-call__section tool-call__error-section"
      >
        <div class="tool-call__section-title">
          <EaIcon
            name="triangle-alert"
            :size="12"
          />
          <span>{{ t('message.error') }}</span>
        </div>
        <div class="tool-call__error">
          {{ toolCall.errorMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
