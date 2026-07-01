<script setup lang="ts">
import { EaIcon } from '@/components/common'
import { useToolCallDisplay, type ToolCallDisplayProps } from './useToolCallDisplay'

const props = withDefaults(defineProps<ToolCallDisplayProps>(), {
  live: false,
  compact: false,
  defaultExpanded: undefined,
  defaultResultExpanded: undefined,
  autoCollapseOnComplete: true
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
  locationBadges,
  isTerminalLikeTool,
  isAgentExecutionTool,
  agentExecutionTitle,
  animatedArguments,
  animatedResult,
  agentPrompt,
  toolSummary
} = useToolCallDisplay(props)
</script>

<template>
  <div
    class="tool-call"
    :class="[statusClass, { 'tool-call--compact': compact, 'tool-call--agent-run': isAgentExecutionTool }]"
  >
    <!-- 工具调用头部：图标 → 类型 → 文件位置徽标 → 展开符号 -->
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
        <span
          class="tool-call__name"
          :class="{ 'tool-call__name--sweep': toolCall.status === 'running' }"
        >{{ isAgentExecutionTool ? agentExecutionTitle : toolCall.name }}</span>
        <!-- 文件位置徽标：读取/写入/修改了哪些文件 -->
        <span
          v-for="(badge, index) in locationBadges"
          :key="index"
          class="tool-call__loc-badge"
          :class="`tool-call__loc-badge--${badge.tone}`"
          :title="badge.title"
        >
          <EaIcon
            :name="badge.icon"
            :size="11"
          />
          <span class="tool-call__loc-label">{{ badge.label }}</span>
        </span>
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
      <div
        v-if="isAgentExecutionTool && agentPrompt"
        class="tool-call__section tool-call__section--agent-prompt"
      >
        <div class="tool-call__section-title">
          <EaIcon
            name="message-square-text"
            :size="12"
          />
          <span>任务输入</span>
        </div>
        <pre class="tool-call__code">{{ agentPrompt }}</pre>
      </div>

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
            <span>{{ isAgentExecutionTool ? '执行日志 / 结果' : t('message.result') }}</span>
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

      <!-- 文件变更：嵌入工具气泡内部展开，复用同一气泡，宽度跟随工具气泡 -->
      <slot name="fileChanges" />
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
