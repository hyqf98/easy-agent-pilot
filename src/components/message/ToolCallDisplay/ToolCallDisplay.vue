<script setup lang="ts">
/** ToolCallDisplay 组件：工具调用展示块，渲染工具图标、参数、结果与状态（逻辑见 useToolCallDisplay.ts） */
import { EaIcon } from '@/components/common'
import { useToolCallDisplay, type ToolCallDisplayProps } from './useToolCallDisplay'

const props = withDefaults(defineProps<ToolCallDisplayProps>(), {
  live: false,
  compact: false,
  defaultExpanded: undefined,
  autoCollapseOnComplete: true
})

const {
  t,
  isExpanded,
  toggleExpand,
  statusClass,
  toolIcon,
  toolCategoryLabel,
  displayName,
  involvedFiles,
  isTerminalLikeTool,
  isAgentExecutionTool,
  isSkillTool,
  animatedArguments,
  animatedResult,
  agentPrompt,
  skillContent,
  toolSummary
} = useToolCallDisplay(props)
</script>

<template>
  <div
    class="tool-call"
    :class="[statusClass, { 'tool-call--compact': compact, 'tool-call--agent-run': isAgentExecutionTool }]"
  >
    <!-- 工具调用头部：图标 → 类型 → 名称 → 简短摘要（文件路径仅展开后显示） -->
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
        <span class="tool-call__category">{{ toolCategoryLabel }}</span>
        <span
          class="tool-call__name"
          :class="{ 'tool-call__name--sweep': toolCall.status === 'running' }"
        >{{ displayName }}</span>
        <span class="tool-call__summary">{{ toolSummary }}</span>
        <EaIcon
          class="tool-call__chevron"
          :class="{ 'tool-call__chevron--open': isExpanded }"
          name="chevron-right"
          :size="12"
        />
      </div>
    </button>

    <!-- 工具调用内容：文件路径 / 参数（输入）/ 结果（输出，如读取的文件内容）均在此处 -->
    <div
      v-show="isExpanded"
      class="tool-call__content"
    >
      <!-- 文件路径：收起态不显示，展开后在此处集中展示输入/输出涉及的文件 -->
      <div
        v-if="involvedFiles.length > 0"
        class="tool-call__section tool-call__section--files"
      >
        <div class="tool-call__section-title">
          <EaIcon
            name="file"
            :size="12"
          />
          <span>{{ t('message.files') }}</span>
        </div>
        <ul class="tool-call__file-list">
          <li
            v-for="(file, index) in involvedFiles"
            :key="index"
            class="tool-call__file-item"
            :title="file.fullPath"
          >
            <EaIcon
              :name="file.icon"
              :size="11"
            />
            <span class="tool-call__file-path">{{ file.fullPath }}</span>
            <span
              v-if="file.line"
              class="tool-call__file-line"
            >:{{ file.line }}</span>
          </li>
        </ul>
      </div>

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

      <div
        v-if="isSkillTool && skillContent"
        class="tool-call__section tool-call__section--skill-content"
      >
        <div class="tool-call__section-title">
          <EaIcon
            name="sparkles"
            :size="12"
          />
          <span>内容</span>
        </div>
        <pre class="tool-call__code tool-call__code--skill">{{ skillContent }}</pre>
      </div>

      <!-- 参数 -->
      <div
        v-if="!isSkillTool"
        class="tool-call__section"
      >
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
        <div class="tool-call__section-title">
          <EaIcon
            :name="isAgentExecutionTool ? 'scroll-text' : 'log-out'"
            :size="12"
          />
          <span>{{ isAgentExecutionTool ? '执行日志 / 结果' : t('message.result') }}</span>
        </div>
        <div class="tool-call__result">
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
