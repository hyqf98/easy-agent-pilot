/**
 * useSoloExecutionLogPanel — SOLO 执行日志面板的全部展示逻辑与状态派生。
 *
 * 职责：
 * 1. 依据 runId 加载执行日志、步骤列表，并订阅相关 store（运行 / 执行 / 专家 / 智能体 / 模型配置）；
 * 2. 按作用域（协调器 / 指定步骤 / 强制协调作用域）筛选可见日志；
 * 3. 派生 token 用量、解析模型、状态文案与配色、面板标题等纯展示数据；
 * 4. 将原始日志条目整组 reduce 成时间线（ExecutionTimeline）可消费的条目序列，
 *    其间维护「上一条 thinking / content」的游标以正确合并增量片段；
 * 5. 管理自动滚动、运行时配置预加载与待输入表单提交。
 *
 * 该 composable 不直接操作 DOM，唯一的模板 ref（scrollerRef）通过返回值暴露给模板使用。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import DynamicForm from '@/views/plan/dynamicForm/DynamicForm.vue'
import ExecutionTimeline from '@/components/message/ExecutionTimeline/ExecutionTimeline.vue'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useAgentStore } from '@/stores/agent'
import { formatTokenCount } from '@/stores/token'
import { useSoloExecutionStore } from '@/stores/soloExecution'
import { useSoloRunStore } from '@/stores/soloRun'
import { useSubAgentStore } from '@/stores/subAgent'
import type { SoloExecutionStatus, SoloLogEntry, SoloRunStatus, SoloStep, SoloStepStatus } from '@/types/solo'
import type { TimelineEntry } from '@/types/timeline'
import { buildToolCallMapFromLogs } from '@/utils/toolCallLog'
import { DEFAULT_CONTEXT_WINDOW, resolveConfiguredContextWindow } from '@/utils/configuredModelContext'
import { resolveSubAgentById, resolveSubAgentExecutionWithFallback } from '@/services/subAgent/runtime'

/** 组件 Props */
export interface SoloExecutionLogPanelProps {
  /** 当前 SOLO 运行 id */
  runId: string
  /** 聚焦展示的步骤 id（为空时展示协调器作用域） */
  stepId?: string | null
  /** 强制锁定为协调器（调度器）作用域 */
  forceCoordinatorScope?: boolean
}

/** 底层 CLI 自动重试状态（来自日志 metadata 的 retryGroup=cli_failure_retry） */
interface SoloCliRetryState {
  current: number
  max: number
}

/**
 * SoloExecutionLogPanel 组件的 composable。
 * @param props 组件 props（runId / stepId / forceCoordinatorScope）
 */
export function useSoloExecutionLogPanel(props: SoloExecutionLogPanelProps) {
  const soloExecutionStore = useSoloExecutionStore()
  const soloRunStore = useSoloRunStore()
  const agentTeamsStore = useSubAgentStore()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()

  /** 日志滚动容器 ref（暴露给模板以控制滚动定位） */
  const scrollerRef = ref<HTMLElement | null>(null)
  /** 是否跟随最新日志自动滚动到底部 */
  const autoScroll = ref(true)

  /** 当前运行实体 */
  const run = computed(() => soloRunStore.runs.find((item) => item.id === props.runId) || null)
  /** 当前运行的执行状态快照 */
  const state = computed(() => soloExecutionStore.getExecutionState(props.runId))
  /** 全量日志（未按作用域筛选） */
  const allLogs = computed(() => state.value?.logs ?? [])
  /** 当前运行的步骤列表 */
  const steps = computed(() => soloExecutionStore.getSteps(props.runId))
  const currentSteps = computed(() => steps.value)
  /** 选中的步骤（stepId 命中时） */
  const selectedStep = computed<SoloStep | null>(() =>
    props.stepId ? steps.value.find((step) => step.id === props.stepId) || null : null
  )

  /**
   * 当前作用域下的可见日志。
   * - 指定 stepId：仅该步骤的日志；
   * - 强制协调作用域 / 默认：仅协调器作用域（无 stepId 且 scope 非 step）日志。
   */
  const visibleLogs = computed<SoloLogEntry[]>(() => {
    if (props.stepId) {
      return allLogs.value.filter((log) => log.stepId === props.stepId)
    }

    if (props.forceCoordinatorScope) {
      return allLogs.value.filter((log) => !log.stepId && log.scope !== 'step')
    }

    return allLogs.value.filter((log) => !log.stepId && log.scope !== 'step')
  })

  /** 选中步骤对应的专家实体（解析失败返回 null） */
  const selectedExpert = computed(() =>
    resolveSubAgentById(selectedStep.value?.selectedExpertId, agentTeamsStore.subAgents)
  )
  /** 协调器专家实体 */
  const coordinatorExpert = computed(() =>
    resolveSubAgentById(run.value?.coordinatorExpertId, agentTeamsStore.subAgents)
  )

  /** 当前作用域生效的运行时（步骤专家 优先，否则回退到协调器专家） */
  const currentRuntime = computed(() => {
    if (selectedStep.value) {
      return resolveSubAgentExecutionWithFallback(selectedExpert.value, agentStore.agents)
    }

    return resolveSubAgentExecutionWithFallback(coordinatorExpert.value, agentStore.agents, run.value?.coordinatorModelId)
  })

  /** 当前作用域专家显示名（带兜底文案） */
  const selectedExpertLabel = computed(() => {
    if (props.forceCoordinatorScope) {
      return coordinatorExpert.value?.name || run.value?.coordinatorExpertId || '规划智能体'
    }
    if (selectedStep.value) {
      return selectedExpert.value?.name || selectedStep.value.selectedExpertId || '未指定'
    }

    return coordinatorExpert.value?.name || run.value?.coordinatorExpertId || '规划智能体'
  })

  /** 仅按可见日志累加的 token 用量（用于步骤 / 强制协调作用域） */
  const scopedTokenUsage = computed(() => {
    let inputTokens = 0
    let outputTokens = 0
    let model: string | undefined
    for (const log of visibleLogs.value) {
      if (log.metadata) {
        if (typeof log.metadata.inputTokens === 'number') {
          inputTokens += log.metadata.inputTokens
        }
        if (typeof log.metadata.outputTokens === 'number') {
          outputTokens += log.metadata.outputTokens
        }
        if (typeof log.metadata.model === 'string' && log.metadata.model.trim()) {
          model = log.metadata.model.trim()
        }
      }
    }
    return { inputTokens, outputTokens, model }
  })

  /** 当前作用域对外的 token 用量汇总（步骤/强制协调走累加值，否则取执行状态快照） */
  const tokenUsage = computed(() => {
    if (props.stepId || props.forceCoordinatorScope) {
      return {
        inputTokens: scopedTokenUsage.value.inputTokens,
        outputTokens: scopedTokenUsage.value.outputTokens,
        model: scopedTokenUsage.value.model,
        resetCount: 0,
        lastUpdatedAt: null as string | null
      }
    }
    return state.value?.tokenUsage ?? {
      inputTokens: 0,
      outputTokens: 0,
      model: undefined,
      resetCount: 0,
      lastUpdatedAt: null
    }
  })

  /** token 占用总量（优先取执行状态自带的 contextWindowOccupancy） */
  const tokenUsageTotal = computed(() =>
    tokenUsage.value.contextWindowOccupancy
      ?? (tokenUsage.value.inputTokens + tokenUsage.value.outputTokens)
  )

  /** 解析出的模型 id（日志 > 运行时 > 智能体 > 运行协调模型，逐级回退） */
  const resolvedModelId = computed(() =>
    tokenUsage.value.model
      || currentRuntime.value?.modelId
      || currentRuntime.value?.agent.modelId
      || currentRuntime.value?.agent.provider
      || run.value?.coordinatorModelId
      || ''
  )

  /** 当前模型对应的上下文窗口上限 */
  const tokenContextLimit = computed(() => {
    const runtimeAgent = currentRuntime.value?.agent
    if (!runtimeAgent) {
      return resolveConfiguredContextWindow([], {
        runtimeModelId: resolvedModelId.value,
        fallbackContextWindow: DEFAULT_CONTEXT_WINDOW
      })
    }

    return resolveConfiguredContextWindow(agentConfigStore.getModelsConfigs(runtimeAgent.id), {
      runtimeModelId: tokenUsage.value.model,
      selectedModelId: currentRuntime.value?.modelId,
      agentModelId: runtimeAgent.modelId,
      fallbackContextWindow: DEFAULT_CONTEXT_WINDOW
    })
  })

  /** token 占用百分比（0-100，封顶 100） */
  const tokenUsagePercentage = computed(() => {
    if (tokenContextLimit.value <= 0) return 0
    return Math.min(100, (tokenUsageTotal.value / tokenContextLimit.value) * 100)
  })

  /** token 占用等级（用于配色分级） */
  const tokenUsageLevel = computed(() => {
    if (tokenUsagePercentage.value >= 95) return 'critical'
    if (tokenUsagePercentage.value >= 80) return 'danger'
    if (tokenUsagePercentage.value >= 60) return 'warning'
    return 'safe'
  })

  /** token 进度条内联宽度样式 */
  const tokenProgressStyle = computed(() => ({
    width: `${tokenUsagePercentage.value}%`
  }))

  /** 是否展示待输入表单（输入请求与当前作用域匹配） */
  const pendingInputVisible = computed(() => {
    if (!run.value?.inputRequest) return false
    if (!props.stepId) return !run.value.inputRequest.stepId
    return run.value.inputRequest.stepId === props.stepId
  })

  /** 当前作用域是否处于执行中状态 */
  const isScopeRunning = computed(() => {
    if (props.forceCoordinatorScope) {
      const es = state.value?.status
      if (es === 'running') {
        return !currentSteps.value.some((step) => step.status === 'running')
      }
      return false
    }
    if (selectedStep.value) {
      return selectedStep.value.status === 'running'
    }

    return run.value?.executionStatus === 'running'
  })

  /** 面板标题（强制协调 / 选中步骤 / 默认协调 三态） */
  const headerTitle = computed(() => {
    if (props.forceCoordinatorScope) return '调度器执行日志'
    return selectedStep.value?.title || '协调日志流程'
  })

  /** 头部节点标签文案 */
  const headerMetaLabel = computed(() => {
    if (props.forceCoordinatorScope) return '调度节点'
    return selectedStep.value ? '执行节点' : '调度节点'
  })

  /** 面板副标题（摘要文案，按作用域回退） */
  const panelSubtitle = computed(() => {
    if (props.forceCoordinatorScope) {
      return '调度决策、专家选择、异常与状态回写'
    }
    if (selectedStep.value) {
      return selectedStep.value.resultSummary
        || selectedStep.value.summary
        || selectedStep.value.description
        || '等待结构化结果与交付摘要'
    }

    return '调度决策、异常与状态回写'
  })

  /**
   * 从可见日志尾部向前查找最近一次「底层 CLI 自动重试」状态。
   * 遇到任何实质内容/工具/错误日志即认为重试链中断，返回 null。
   */
  const activeCliRetryState = computed<SoloCliRetryState | null>(() => {
    for (let index = visibleLogs.value.length - 1; index >= 0; index -= 1) {
      const log = visibleLogs.value[index]
      const metadata = log.metadata

      if (
        metadata?.retryGroup === 'cli_failure_retry'
        && typeof metadata.retryCount === 'number'
        && typeof metadata.maxRetries === 'number'
      ) {
        return {
          current: metadata.retryCount,
          max: metadata.maxRetries
        }
      }

      if (
        log.type === 'content'
        || log.type === 'thinking'
        || log.type === 'thinking_start'
        || log.type === 'tool_use'
        || log.type === 'tool_input_delta'
        || log.type === 'tool_result'
        || log.type === 'error'
        || (log.type === 'system' && metadata?.retryGroup !== 'cli_failure_retry')
      ) {
        return null
      }
    }

    return null
  })

  /** 头部状态文案（步骤优先，否则取运行状态） */
  const statusText = computed(() => {
    if (selectedStep.value) {
      return getStepStatusLabel(selectedStep.value.status)
    }

    return getRunStatusLabel(run.value?.executionStatus, run.value?.status)
  })

  /** 头部状态配色（步骤优先，否则取运行状态） */
  const statusColor = computed(() => {
    if (selectedStep.value) {
      return getStepStatusColor(selectedStep.value.status)
    }

    return getRunStatusColor(run.value?.executionStatus, run.value?.status)
  })

  /**
   * 将可见日志整组 reduce 成时间线条目序列。
   *
   * 处理逻辑要点：
   * - tool_input_delta / tool_result 仅用于工具调用映射拼装，不单独产出条目；
   * - thinking_start 建立新思考条目，后续 thinking 增量合并到同一游标；
   * - content 增量合并到 content 游标，且写入 content 会清除 thinking 游标（反之亦然）；
   * - tool_use / error / 其他 system 各自独立产出条目；
   * - 每个条目附带 runtimeFallbackUsage，优先用日志自带 model，否则回退到 resolvedModelId。
   */
  const timelineEntries = computed<TimelineEntry[]>(() => {
    const toolCallMap = buildToolCallMapFromLogs(visibleLogs.value, {
      fallbackStatus: isScopeRunning.value ? 'running' : 'success'
    })
    let lastThinkingEntry: TimelineEntry | null = null
    let lastContentEntry: TimelineEntry | null = null
    const buildRuntimeFallbackUsage = (model?: string) => {
      const resolvedModel = model?.trim() || resolvedModelId.value || ''
      return resolvedModel
        ? { model: resolvedModel }
        : undefined
    }

    return visibleLogs.value.reduce<TimelineEntry[]>((entries, log) => {
      const logModel = typeof log.metadata?.model === 'string' && log.metadata.model.trim()
        ? log.metadata.model.trim()
        : undefined

      if (log.type === 'tool_input_delta' || log.type === 'tool_result') {
        return entries
      }

      if (log.type === 'thinking_start') {
        lastThinkingEntry = {
          id: `thinking-${log.id}`,
          type: 'thinking',
          content: '',
          timestamp: log.timestamp,
          animate: isScopeRunning.value,
          runtimeFallbackUsage: buildRuntimeFallbackUsage(logModel)
        }
        entries.push(lastThinkingEntry)
        return entries
      }

      if (log.type === 'thinking') {
        if (!lastThinkingEntry) {
          lastThinkingEntry = {
            id: `thinking-${log.id}`,
            type: 'thinking',
            content: log.content,
            timestamp: log.timestamp,
            animate: isScopeRunning.value,
            runtimeFallbackUsage: buildRuntimeFallbackUsage(logModel)
          }
          entries.push(lastThinkingEntry)
        } else {
          lastThinkingEntry.content = `${lastThinkingEntry.content || ''}${log.content}`
          lastThinkingEntry.timestamp = log.timestamp
          if (logModel || !lastThinkingEntry.runtimeFallbackUsage?.model) {
            lastThinkingEntry.runtimeFallbackUsage = buildRuntimeFallbackUsage(logModel)
          }
        }
        lastContentEntry = null
        return entries
      }

      if (log.type === 'content') {
        if (!lastContentEntry) {
          lastContentEntry = {
            id: `content-${log.id}`,
            type: 'content',
            content: log.content,
            timestamp: log.timestamp,
            role: 'assistant',
            animate: isScopeRunning.value,
            runtimeFallbackUsage: buildRuntimeFallbackUsage(logModel)
          }
          entries.push(lastContentEntry)
        } else {
          lastContentEntry.content = `${lastContentEntry.content || ''}${log.content}`
          lastContentEntry.timestamp = log.timestamp
          if (logModel || !lastContentEntry.runtimeFallbackUsage?.model) {
            lastContentEntry.runtimeFallbackUsage = buildRuntimeFallbackUsage(logModel)
          }
        }
        lastThinkingEntry = null
        return entries
      }

      if (log.type === 'tool_use') {
        entries.push({
          id: `tool-${log.id}`,
          type: 'tool',
          timestamp: log.timestamp,
          toolCall: toolCallMap.get(log.metadata?.toolCallId || log.id),
          runtimeFallbackUsage: buildRuntimeFallbackUsage(logModel)
        })
        lastThinkingEntry = null
        lastContentEntry = null
        return entries
      }

      if (log.type === 'error') {
        entries.push({
          id: `error-${log.id}`,
          type: 'error',
          content: log.content,
          timestamp: log.timestamp,
          runtimeFallbackUsage: {
            model: typeof log.metadata?.model === 'string' && log.metadata.model.trim()
              ? log.metadata.model.trim()
              : (resolvedModelId.value || undefined),
            inputTokens: typeof log.metadata?.inputTokens === 'number'
              ? log.metadata.inputTokens
              : undefined,
            outputTokens: typeof log.metadata?.outputTokens === 'number'
              ? log.metadata.outputTokens
              : undefined
          }
        })
        lastThinkingEntry = null
        lastContentEntry = null
        return entries
      }

      entries.push({
        id: `system-${log.id}`,
        type: 'system',
        content: log.content,
        timestamp: log.timestamp,
        runtimeFallbackUsage: {
          model: typeof log.metadata?.model === 'string' && log.metadata.model.trim()
            ? log.metadata.model.trim()
            : (resolvedModelId.value || undefined),
          inputTokens: typeof log.metadata?.inputTokens === 'number'
            ? log.metadata.inputTokens
            : undefined,
          outputTokens: typeof log.metadata?.outputTokens === 'number'
            ? log.metadata.outputTokens
            : undefined
        }
      })
      lastThinkingEntry = null
      lastContentEntry = null
      return entries
    }, [])
  })

  /** 步骤状态 → 中文文案 */
  function getStepStatusLabel(status: SoloStepStatus): string {
    switch (status) {
      case 'pending': return '等待'
      case 'running': return '执行中'
      case 'completed': return '完成'
      case 'failed': return '失败'
      case 'blocked': return '待输入'
      case 'skipped': return '跳过'
      default: return status
    }
  }

  /** 运行执行状态 / 运行状态 → 中文文案（执行状态优先） */
  function getRunStatusLabel(executionStatus?: SoloExecutionStatus | null, runStatus?: SoloRunStatus | null): string {
    switch (executionStatus || runStatus) {
      case 'running': return '执行中'
      case 'blocked': return '待输入'
      case 'paused': return '已暂停'
      case 'completed': return '已完成'
      case 'failed':
      case 'error':
        return '失败'
      case 'stopped': return '已停止'
      case 'draft': return '草稿'
      default: return '空闲'
    }
  }

  /** 步骤状态 → 配色 token */
  function getStepStatusColor(status: SoloStepStatus): string {
    switch (status) {
      case 'running': return 'primary'
      case 'completed': return 'success'
      case 'blocked': return 'warning'
      case 'failed': return 'error'
      default: return 'gray'
    }
  }

  /** 运行执行状态 / 运行状态 → 配色 token（执行状态优先） */
  function getRunStatusColor(executionStatus?: SoloExecutionStatus | null, runStatus?: SoloRunStatus | null): string {
    switch (executionStatus || runStatus) {
      case 'running': return 'primary'
      case 'completed': return 'success'
      case 'blocked': return 'warning'
      case 'failed':
      case 'error':
        return 'error'
      default: return 'gray'
    }
  }

  /** 滚动事件：根据距底部距离自动开关 autoScroll */
  function handleScroll() {
    if (!scrollerRef.value) return
    const { scrollTop, scrollHeight, clientHeight } = scrollerRef.value
    autoScroll.value = scrollHeight - scrollTop - clientHeight < 36
  }

  /** 提交待输入表单 */
  async function handleSubmit(values: Record<string, unknown>) {
    await soloExecutionStore.submitRunInput(props.runId, values)
  }

  /** 预加载当前运行时专家对应的模型配置（用于解析上下文窗口） */
  async function ensureRuntimeConfigsLoaded() {
    const runtimeAgent = currentRuntime.value?.agent
    if (!runtimeAgent) {
      return
    }

    await agentConfigStore.ensureModelsConfigs(runtimeAgent.id, runtimeAgent.provider)
  }

  // runId 变化时重新加载日志
  watch(
    () => props.runId,
    async (runId) => {
      if (!runId) return
      await soloExecutionStore.loadLogs(runId)
    },
    { immediate: true }
  )

  // 运行时专家变化时预加载模型配置
  watch(
    () => currentRuntime.value?.agent.id,
    async () => {
      await ensureRuntimeConfigsLoaded()
    },
    { immediate: true }
  )

  // 日志变化且开启自动滚动时滚动到底部
  watch(
    () => `${props.stepId ?? 'coordinator'}:${visibleLogs.value.map((log) => log.id).join(':')}`,
    async () => {
      if (!autoScroll.value) return
      await nextTick()
      if (scrollerRef.value) {
        scrollerRef.value.scrollTop = scrollerRef.value.scrollHeight
      }
    }
  )

  // 挂载时并行加载日志、智能体、专家
  onMounted(async () => {
    await Promise.all([
      soloExecutionStore.loadLogs(props.runId),
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents()
    ])
  })

  return {
    // 子组件
    DynamicForm,
    ExecutionTimeline,
    // 工具方法
    formatTokenCount,
    // 模板 ref
    scrollerRef,
    // 派生状态
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
    // 方法
    handleSubmit,
    handleScroll
  }
}
