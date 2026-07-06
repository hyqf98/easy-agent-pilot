<script setup lang="ts">
import { useSoloExecutionLogPanel } from './useSoloExecutionLogPanel'
import type { SoloExecutionLogPanelProps } from './useSoloExecutionLogPanel'

const props = defineProps<SoloExecutionLogPanelProps>()

const {
  DynamicForm,
  ExecutionTimeline,
  formatTokenCount,
  scrollerRef,
  run,
  selectedStep,
  visibleLogs,
  selectedExpertLabel,
  panelSubtitle,
  headerTitle,
  headerMetaLabel,
  statusText,
  statusColor,
  tokenUsageTotal,
  tokenContextLimit,
  tokenUsage,
  tokenUsageLevel,
  tokenProgressStyle,
  tokenUsagePercentage,
  resolvedModelId,
  pendingInputVisible,
  isScopeRunning,
  timelineEntries,
  activeCliRetryState,
  handleSubmit,
  handleScroll
} = useSoloExecutionLogPanel(props)
</script>

<template>
  <div class="task-execution-log solo-execution-log">
    <div class="log-header">
      <div class="header-left">
        <h4
          class="log-title"
          :title="headerTitle"
        >
          {{ headerTitle }}
        </h4>
        <span
          class="status-badge"
          :class="statusColor"
        >
          {{ statusText }}
        </span>
      </div>
      <div class="header-actions">
        <span class="solo-execution-log__meta-chip">
          {{ headerMetaLabel }}
        </span>
        <span
          v-if="selectedStep"
          class="solo-execution-log__meta-chip"
        >
          Depth {{ selectedStep.depth }}
        </span>
      </div>
    </div>

    <section class="solo-execution-log__summary">
      <p class="solo-execution-log__summary-eyebrow">
        {{ (selectedStep && !props.forceCoordinatorScope) ? 'Execution Summary' : 'Coordinator Summary' }}
      </p>
      <p class="solo-execution-log__summary-text">
        {{ panelSubtitle }}
      </p>
      <div class="solo-execution-log__summary-meta">
        <span>专家：{{ selectedExpertLabel }}</span>
        <span>{{ visibleLogs.length }} 条日志</span>
        <span v-if="selectedStep">更新时间：{{ new Date(selectedStep.updatedAt).toLocaleString('zh-CN') }}</span>
      </div>
      <div
        v-if="selectedStep?.resultFiles.length"
        class="solo-execution-log__summary-files"
      >
        <span
          v-for="file in selectedStep.resultFiles"
          :key="file"
        >
          {{ file }}
        </span>
      </div>
    </section>

    <div
      v-if="tokenUsageTotal > 0 || resolvedModelId"
      class="token-usage-panel"
    >
      <div class="token-usage-panel__meta">
        <div class="token-usage-panel__title">
          <span>Token Usage</span>
          <span
            v-if="resolvedModelId"
            class="token-usage-panel__model"
          >
            {{ resolvedModelId }}
          </span>
        </div>
        <div class="token-usage-panel__stats">
          <span>{{ formatTokenCount(tokenUsageTotal) }} / {{ formatTokenCount(tokenContextLimit) }}</span>
          <span v-if="tokenUsage.resetCount > 0">重置 {{ tokenUsage.resetCount }} 次</span>
        </div>
      </div>
      <div
        class="token-usage-panel__bar"
        :class="`token-usage-panel__bar--${tokenUsageLevel}`"
      >
        <div
          class="token-usage-panel__fill"
          :style="tokenProgressStyle"
        />
      </div>
      <div class="token-usage-panel__breakdown">
        <span>输入 {{ formatTokenCount(tokenUsage.inputTokens) }}</span>
        <span>输出 {{ formatTokenCount(tokenUsage.outputTokens) }}</span>
        <span>{{ Math.round(tokenUsagePercentage) }}%</span>
      </div>
    </div>

    <div
      v-if="pendingInputVisible && run?.inputRequest"
      class="input-form-section"
    >
      <h5 class="section-title">
        {{ run.inputRequest.question || '等待补充输入' }}
      </h5>
      <DynamicForm
        :schema="run.inputRequest.formSchema"
        @submit="handleSubmit"
      />
    </div>

    <div
      ref="scrollerRef"
      class="log-content"
      @scroll="handleScroll"
    >
      <div
        v-if="timelineEntries.length === 0"
        class="empty-state"
      >
        <span v-if="isScopeRunning">{{ selectedStep ? '当前步骤执行中...' : '协调 AI 正在调度...' }}</span>
        <span v-else>{{ selectedStep ? '暂无步骤日志' : '暂无调度日志' }}</span>
      </div>

      <div
        v-else
        class="log-entries"
      >
        <ExecutionTimeline
          :entries="timelineEntries"
          :group-tool-calls="true"
          :compact-context-notices="true"
        />
      </div>

      <div
        v-if="isScopeRunning"
        class="running-indicator"
      >
        <span class="indicator-dot" />
        <span class="indicator-text">
          {{ activeCliRetryState
            ? `底层自动重试中 ${activeCliRetryState.current}/${activeCliRetryState.max}`
            : 'AI 正在执行...' }}
        </span>
      </div>
    </div>
  </div>
</template>
<style scoped src="./SoloExecutionLogPanel.css"></style>
