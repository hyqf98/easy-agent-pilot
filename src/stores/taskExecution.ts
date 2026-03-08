import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ExecutionLogEntry,
  ExecutionLogType,
  TaskExecutionState,
  ExecutionQueue,
  CreateExecutionLogInput,
  RustExecutionLog,
  SaveTaskExecutionResultInput,
  TaskExecutionResultRecord,
  PlanExecutionProgress
} from '@/types/taskExecution'
import type { ToolCall } from '@/stores/message'
import type { StreamEvent, McpServerConfig } from '@/services/conversation/strategies/types'
import type { Task, DynamicFormSchema, AIFormRequest } from '@/types/plan'
import { useTaskStore } from '@/stores/task'
import { usePlanStore } from '@/stores/plan'
import { useProjectStore } from '@/stores/project'
import { useAgentStore } from '@/stores/agent'
import { agentExecutor } from '@/services/conversation/AgentExecutor'
import type { ConversationContext } from '@/services/conversation/strategies/types'
import { invoke } from '@tauri-apps/api/core'

/**
 * 任务执行状态管理 Store
 *
 * 功能：
 * - 执行队列管理：同时只能执行一个任务
 * - 流式事件处理：记录 AI 执行日志
 * - 日志持久化：保存到后端数据库
 */

// 待持久化的日志缓冲区结构
interface PendingLogBuffer {
  content: string
  thinking: string
  lastFlushTime: number
  flushTimer: ReturnType<typeof setTimeout> | null
}

// 批量持久化配置
const FLUSH_INTERVAL_MS = 2000 // 每 2 秒批量持久化一次
const FLUSH_THRESHOLD_CHARS = 500 // 累积 500 字符后触发批量持久化

export const useTaskExecutionStore = defineStore('taskExecution', () => {
  // ==================== State ====================

  // 任务执行状态映射 (taskId -> TaskExecutionState)
  const executionStates = ref<Map<string, TaskExecutionState>>(new Map())

  // 执行队列映射 (planId -> ExecutionQueue)
  const executionQueues = ref<Map<string, ExecutionQueue>>(new Map())

  // 当前查看的任务 ID（用于右侧面板显示日志）
  const currentViewingTaskId = ref<string | null>(null)

  // 中止控制器
  const abortController = ref<AbortController | null>(null)

  // 待持久化的日志缓冲区 (taskId -> PendingLogBuffer)
  const pendingLogBuffers = ref<Map<string, PendingLogBuffer>>(new Map())

  // ==================== Getters ====================

  /**
   * 获取任务的执行状态
   */
  const getExecutionState = computed(() => {
    return (taskId: string): TaskExecutionState | undefined => {
      return executionStates.value.get(taskId)
    }
  })

  /**
   * 判断任务是否正在执行（包括排队中）
   */
  const isTaskExecuting = computed(() => {
    return (taskId: string): boolean => {
      const state = executionStates.value.get(taskId)
      if (!state) return false
      return state.status === 'running' || state.status === 'queued'
    }
  })

  /**
   * 判断任务是否正在运行（不包括排队中）
   */
  const isTaskRunning = computed(() => {
    return (taskId: string): boolean => {
      const state = executionStates.value.get(taskId)
      return state?.status === 'running'
    }
  })

  /**
   * 获取计划的执行队列
   */
  const getExecutionQueue = computed(() => {
    return (planId: string): ExecutionQueue | undefined => {
      return executionQueues.value.get(planId)
    }
  })

  /**
   * 获取计划中正在执行的任务 ID
   */
  const getCurrentRunningTaskId = computed(() => {
    return (planId: string): string | null => {
      const queue = executionQueues.value.get(planId)
      return queue?.currentTaskId ?? null
    }
  })

  /**
   * 获取任务的排队位置（0 表示正在执行，-1 表示不在队列中）
   */
  const getQueuePosition = computed(() => {
    return (taskId: string): number => {
      const taskStore = useTaskStore()
      const task = taskStore.tasks.find(t => t.id === taskId)
      if (!task) return -1

      const queue = executionQueues.value.get(task.planId)
      if (!queue) return -1

      if (queue.currentTaskId === taskId) return 0
      const index = queue.pendingTaskIds.indexOf(taskId)
      return index === -1 ? -1 : index + 1
    }
  })

  /**
   * 获取任务的执行日志
   */
  const getTaskLogs = computed(() => {
    return (taskId: string): ExecutionLogEntry[] => {
      const state = executionStates.value.get(taskId)
      return state?.logs ?? []
    }
  })

  // ==================== Actions ====================

  /**
   * 初始化任务执行状态
   */
  function initExecutionState(taskId: string): TaskExecutionState {
    let state = executionStates.value.get(taskId)
    if (!state) {
      state = {
        taskId,
        status: 'idle',
        sessionId: null,
        startedAt: null,
        completedAt: null,
        logs: [],
        accumulatedContent: '',
        accumulatedThinking: '',
        toolCalls: []
      }
      executionStates.value.set(taskId, state)
    }
    return state
  }

  /**
   * 将任务加入执行队列
   */
  async function enqueueTask(planId: string, taskId: string): Promise<void> {
    // 确保队列存在
    let queue = executionQueues.value.get(planId)
    if (!queue) {
      queue = {
        planId,
        currentTaskId: null,
        pendingTaskIds: []
      }
      executionQueues.value.set(planId, queue)
    }

    // 初始化执行状态
    const state = initExecutionState(taskId)

    // 如果当前有任务在执行，加入排队
    if (queue.currentTaskId) {
      if (!queue.pendingTaskIds.includes(taskId)) {
        queue.pendingTaskIds.push(taskId)
        state.status = 'queued'
      }
      return
    }

    // 开始执行
    queue.currentTaskId = taskId
    await executeTask(planId, taskId)
  }

  /**
   * 执行任务
   */
  async function executeTask(planId: string, taskId: string): Promise<void> {
    const taskStore = useTaskStore()
    const planStore = usePlanStore()
    const projectStore = useProjectStore()
    const agentStore = useAgentStore()

    // 获取任务信息
    const task = taskStore.tasks.find(t => t.id === taskId)
    if (!task) {
      console.error('[TaskExecution] Task not found:', taskId)
      return
    }

    // 获取计划信息
    const plan = planStore.plans.find(p => p.id === planId)
    if (!plan) {
      console.error('[TaskExecution] Plan not found:', planId)
      return
    }

    // 获取项目路径
    const project = projectStore.projects.find(p => p.id === plan.projectId)
    const workingDirectory = project?.path

    // 获取最大重试次数（从计划配置读取）
    const maxRetries = plan.maxRetryCount ?? 3

    // 初始化执行状态
    const state = initExecutionState(taskId)
    state.status = 'running'
    state.startedAt = new Date().toISOString()
    state.accumulatedContent = ''
    state.accumulatedThinking = ''
    state.toolCalls = []
    state.logs = []

    // 清除待持久化缓冲区（如果有）
    const existingBuffer = pendingLogBuffers.value.get(taskId)
    if (existingBuffer) {
      if (existingBuffer.flushTimer) {
        clearTimeout(existingBuffer.flushTimer)
      }
      pendingLogBuffers.value.delete(taskId)
    }

    // 添加系统日志
    await addExecutionLog({
      taskId,
      type: 'system',
      content: `开始执行任务: ${task.title}${task.retryCount > 0 ? ` (重试第 ${task.retryCount} 次)` : ''}`
    })

    try {
      // 获取智能体配置
      const agent = agentStore.agents.find(a => a.id === plan.splitAgentId) || agentStore.agents[0]
      if (!agent) {
        throw new Error('未找到可用的智能体')
      }

      // 检查策略支持
      if (!agentExecutor.isSupported(agent)) {
        throw new Error(`不支持的智能体类型: ${agent.type}`)
      }

      // 创建中止控制器
      abortController.value = new AbortController()

      // 读取同计划最近任务结果，作为上下文注入
      const recentResults = await listRecentPlanResults(planId, 5)

      // 构建执行提示
      const prompt = buildExecutionPrompt(task, recentResults)

      // 获取 MCP 配置（暂时使用空配置）
      const mcpServers: McpServerConfig[] = []

      // 构建对话上下文
      const context: ConversationContext = {
        sessionId: `task-${taskId}`,
        agent,
        messages: [{
          id: `task-prompt-${taskId}`,
          sessionId: `task-${taskId}`,
          role: 'user',
          content: prompt,
          status: 'completed',
          createdAt: new Date().toISOString()
        }],
        workingDirectory,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        executionMode: 'chat',
        responseMode: 'stream_text'
      }

      // 执行对话
      await agentExecutor.execute(context, (event: StreamEvent) => {
        handleStreamEvent(taskId, event)
      })

      // 执行完成
      state.status = 'completed'
      state.completedAt = new Date().toISOString()

      // 检查是否包含表单请求（AI 需要用户输入）
      const formRequest = parseFormRequest(state.accumulatedContent)
      if (formRequest) {
        // 任务需要等待用户输入
        await blockTaskForInput(taskId, formRequest)
        return
      }

      await addExecutionLog({
        taskId,
        type: 'system',
        content: '任务执行完成'
      })

      // 保存结构化执行结果（摘要 + 文件链接）
      const parsedResult = parseExecutionResult(state.accumulatedContent)
      await saveTaskExecutionResult({
        task_id: taskId,
        result_status: 'success',
        result_summary: parsedResult.summary,
        result_files: parsedResult.files
      })

      // 更新任务状态为完成（状态更新失败不影响主流程）
      try {
        await taskStore.updateTask(taskId, { status: 'completed' })
      } catch (statusError) {
        console.warn('[TaskExecution] Failed to update task status to completed:', statusError)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 检查是否是用户主动停止
      const wasStopped = abortController.value?.signal.aborted

      if (wasStopped) {
        // 用户主动停止
        state.status = 'stopped'
        state.completedAt = new Date().toISOString()
        await addExecutionLog({
          taskId,
          type: 'system',
          content: '任务执行已停止'
        })
        // 更新任务状态为 pending
        try {
          await taskStore.updateTask(taskId, { status: 'pending' })
        } catch (statusError) {
          console.warn('[TaskExecution] Failed to update task status to pending:', statusError)
        }
      } else {
        // 执行失败 - 检查是否需要重试
        const currentRetryCount = task.retryCount + 1

        if (currentRetryCount < maxRetries) {
          // 还可以重试
          await addExecutionLog({
            taskId,
            type: 'system',
            content: `任务执行失败: ${errorMessage}，准备第 ${currentRetryCount + 1} 次重试...`
          })

          // 更新重试次数
          try {
            await taskStore.updateTask(taskId, {
              retryCount: currentRetryCount,
              errorMessage
            })
          } catch (statusError) {
            console.warn('[TaskExecution] Failed to update task retry count:', statusError)
          }

          // 保存失败记录
          const parsedResult = parseExecutionResult(state.accumulatedContent)
          await saveTaskExecutionResult({
            task_id: taskId,
            result_status: 'failed',
            result_summary: parsedResult.summary === '任务已执行完成（无详细输出）'
              ? `任务执行失败: ${errorMessage}`
              : parsedResult.summary,
            result_files: parsedResult.files,
            fail_reason: errorMessage
          })

          // 重新加入队列执行（延迟一小段时间）
          state.status = 'idle'
          state.completedAt = new Date().toISOString()

          // 使用 setTimeout 延迟重试，避免立即重试
          setTimeout(() => {
            void executeTask(planId, taskId)
          }, 1000)

          // 不处理队列中的下一个任务，因为当前任务会重试
          return
        } else {
          // 超过最大重试次数，标记为执行失败
          state.status = 'failed'
          state.completedAt = new Date().toISOString()

          await addExecutionLog({
            taskId,
            type: 'error',
            content: `任务执行失败（已重试 ${currentRetryCount} 次）: ${errorMessage}`
          })

          // 更新任务状态为 failed（执行失败）
          try {
            await taskStore.updateTask(taskId, {
              status: 'failed',
              retryCount: currentRetryCount,
              errorMessage
            })
          } catch (statusError) {
            console.warn('[TaskExecution] Failed to update task status to failed:', statusError)
          }

          const parsedResult = parseExecutionResult(state.accumulatedContent)
          const failureSummary = parsedResult.summary === '任务已执行完成（无详细输出）'
            ? `任务执行失败: ${errorMessage}`
            : parsedResult.summary
          await saveTaskExecutionResult({
            task_id: taskId,
            result_status: 'failed',
            result_summary: failureSummary,
            result_files: parsedResult.files,
            fail_reason: errorMessage
          })
        }
      }
    } finally {
      abortController.value = null
      // 确保所有缓冲的日志都被持久化
      await flushPendingLogs(taskId)
      // 处理队列中下一个任务
      await processNextInQueue(planId)
    }
  }

  /**
   * 处理流式事件
   */
  function handleStreamEvent(taskId: string, event: StreamEvent): void {
    const state = executionStates.value.get(taskId)
    if (!state) return

    switch (event.type) {
      case 'content':
        if (event.content) {
          state.accumulatedContent += event.content
          // 使用批量持久化机制
          addStreamLogToBuffer(taskId, 'content', event.content)
        }
        break

      case 'thinking':
        if (event.content) {
          state.accumulatedThinking += event.content
          // 使用批量持久化机制
          addStreamLogToBuffer(taskId, 'thinking', event.content)
        }
        break

      case 'tool_use':
        if (event.toolName && event.toolCallId) {
          const toolCall: ToolCall = {
            id: event.toolCallId,
            name: event.toolName,
            arguments: event.toolInput || {},
            status: 'running'
          }

          const existingIndex = state.toolCalls.findIndex(tc => tc.id === toolCall.id)
          if (existingIndex >= 0) {
            state.toolCalls[existingIndex] = toolCall
          } else {
            state.toolCalls.push(toolCall)
          }

          addExecutionLog({
            taskId,
            type: 'tool_use',
            content: JSON.stringify(event.toolInput, null, 2),
            metadata: {
              toolName: event.toolName,
              toolCallId: event.toolCallId
            }
          })
        }
        break

      case 'tool_result':
        if (event.toolCallId) {
          const result = typeof event.toolResult === 'string'
            ? event.toolResult
            : JSON.stringify(event.toolResult, null, 2)
          const isError = false

          const tc = state.toolCalls.find(t => t.id === event.toolCallId)
          if (tc) {
            tc.result = result
            tc.status = isError ? 'error' : 'success'
            if (isError) {
              tc.errorMessage = result
            }
          }

          addExecutionLog({
            taskId,
            type: 'tool_result',
            content: result,
            metadata: {
              toolCallId: event.toolCallId,
              isError
            }
          })
        }
        break

      case 'error':
        if (event.error) {
          addExecutionLog({
            taskId,
            type: 'error',
            content: event.error
          })
        }
        break
    }
  }

  /**
   * 初始化待持久化缓冲区
   */
  function initPendingBuffer(taskId: string): PendingLogBuffer {
    let buffer = pendingLogBuffers.value.get(taskId)
    if (!buffer) {
      buffer = {
        content: '',
        thinking: '',
        lastFlushTime: Date.now(),
        flushTimer: null
      }
      pendingLogBuffers.value.set(taskId, buffer)
    }
    return buffer
  }

  /**
   * 批量持久化待处理的日志
   */
  async function flushPendingLogs(taskId: string): Promise<void> {
    const buffer = pendingLogBuffers.value.get(taskId)
    if (!buffer) return

    // 清除定时器
    if (buffer.flushTimer) {
      clearTimeout(buffer.flushTimer)
      buffer.flushTimer = null
    }

    const now = Date.now()
    const promises: Promise<void>[] = []

    // 持久化累积的 content
    if (buffer.content.trim()) {
      const contentToFlush = buffer.content
      buffer.content = '' // 清空缓冲区
      buffer.lastFlushTime = now

      promises.push(
        invoke('create_task_execution_log', {
          taskId,
          logType: 'content',
          content: contentToFlush,
          metadata: null
        }).catch(error => {
          console.warn('[TaskExecution] Failed to persist content log:', error)
        }).then(() => {})
      )
    }

    // 持久化累积的 thinking
    if (buffer.thinking.trim()) {
      const thinkingToFlush = buffer.thinking
      buffer.thinking = '' // 清空缓冲区
      buffer.lastFlushTime = now

      promises.push(
        invoke('create_task_execution_log', {
          taskId,
          logType: 'thinking',
          content: thinkingToFlush,
          metadata: null
        }).catch(error => {
          console.warn('[TaskExecution] Failed to persist thinking log:', error)
        }).then(() => {})
      )
    }

    await Promise.all(promises)
  }

  /**
   * 调度批量持久化（防抖）
   */
  function scheduleFlush(taskId: string): void {
    const buffer = pendingLogBuffers.value.get(taskId)
    if (!buffer) return

    // 如果已经有定时器在等待，不需要再设置
    if (buffer.flushTimer) return

    // 设置定时器进行批量持久化
    buffer.flushTimer = setTimeout(() => {
      void flushPendingLogs(taskId)
    }, FLUSH_INTERVAL_MS)
  }

  /**
   * 添加流式日志到缓冲区（延迟持久化）
   */
  function addStreamLogToBuffer(taskId: string, type: 'content' | 'thinking', content: string): void {
    const buffer = initPendingBuffer(taskId)
    const state = executionStates.value.get(taskId)
    if (!state) return

    // 添加到内存日志（立即显示）
    const entry: ExecutionLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      taskId,
      type,
      content,
      timestamp: new Date().toISOString()
    }
    state.logs.push(entry)

    // 累积到缓冲区（延迟持久化）
    if (type === 'content') {
      buffer.content += content
    } else if (type === 'thinking') {
      buffer.thinking += content
    }

    // 检查是否需要立即持久化（达到阈值）
    const totalBuffered = buffer.content.length + buffer.thinking.length
    if (totalBuffered >= FLUSH_THRESHOLD_CHARS) {
      void flushPendingLogs(taskId)
    } else {
      // 否则调度批量持久化
      scheduleFlush(taskId)
    }
  }

  /**
   * 添加执行日志
   */
  async function addExecutionLog(input: CreateExecutionLogInput, persist: boolean = true): Promise<void> {
    const state = executionStates.value.get(input.taskId)
    if (!state) return

    const entry: ExecutionLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      taskId: input.taskId,
      type: input.type,
      content: input.content,
      timestamp: new Date().toISOString(),
      metadata: input.metadata
    }

    state.logs.push(entry)

    // 持久化到后端
    if (persist) {
      try {
        await invoke('create_task_execution_log', {
          taskId: input.taskId,
          logType: input.type,
          content: input.content,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null
        })
      } catch (error) {
        console.warn('[TaskExecution] Failed to persist log:', error)
      }
    }
  }

  async function saveTaskExecutionResult(input: SaveTaskExecutionResultInput): Promise<void> {
    try {
      await invoke('save_task_execution_result', { input })
    } catch (error) {
      console.warn('[TaskExecution] Failed to persist execution result:', error)
    }
  }

  async function listRecentPlanResults(planId: string, limit: number = 5): Promise<TaskExecutionResultRecord[]> {
    try {
      return await invoke<TaskExecutionResultRecord[]>('list_recent_plan_results', { planId, limit })
    } catch (error) {
      console.warn('[TaskExecution] Failed to load recent plan results:', error)
      return []
    }
  }

  async function getPlanExecutionProgress(planId: string): Promise<PlanExecutionProgress | null> {
    try {
      return await invoke<PlanExecutionProgress>('list_plan_execution_progress', { planId })
    } catch (error) {
      console.warn('[TaskExecution] Failed to load plan execution progress:', error)
      return null
    }
  }

  /**
   * 清除计划的执行结果（同时清除关联任务的日志）
   */
  async function clearPlanExecutionResults(planId: string): Promise<number> {
    try {
      const deletedCount = await invoke<number>('clear_plan_execution_results', { planId })

      // 清除内存中相关任务的执行状态
      const taskStore = useTaskStore()
      const planTasks = taskStore.tasks.filter(t => t.planId === planId)
      for (const task of planTasks) {
        const state = executionStates.value.get(task.id)
        if (state) {
          state.logs = []
          state.accumulatedContent = ''
          state.accumulatedThinking = ''
          state.toolCalls = []
        }

        // 清除缓冲区
        const buffer = pendingLogBuffers.value.get(task.id)
        if (buffer) {
          if (buffer.flushTimer) {
            clearTimeout(buffer.flushTimer)
          }
          pendingLogBuffers.value.delete(task.id)
        }
      }

      return deletedCount
    } catch (error) {
      console.warn('[TaskExecution] Failed to clear plan execution results:', error)
      throw error
    }
  }

  /**
   * 提交任务输入并恢复执行
   */
  async function submitTaskInput(taskId: string, values: Record<string, unknown>): Promise<void> {
    const taskStore = useTaskStore()
    const task = taskStore.tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'blocked') {
      console.warn('[TaskExecution] Cannot submit input: task not blocked')
      return
    }

    // 保存用户输入
    await taskStore.updateTask(taskId, {
      inputResponse: values,
      status: 'pending',
      blockReason: undefined,
      inputRequest: undefined
    })

    // 添加日志
    await addExecutionLog({
      taskId,
      type: 'system',
      content: `用户已提交输入: ${JSON.stringify(values)}`
    })

    // 重新加入执行队列
    await enqueueTask(task.planId, taskId)
  }

  /**
   * 跳过阻塞的任务
   */
  async function skipBlockedTask(taskId: string): Promise<void> {
    const taskStore = useTaskStore()
    const task = taskStore.tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'blocked') {
      console.warn('[TaskExecution] Cannot skip: task not blocked')
      return
    }

    // 更新任务状态为 pending
    await taskStore.updateTask(taskId, {
      status: 'pending',
      blockReason: undefined,
      inputRequest: undefined
    })

    // 添加日志
    await addExecutionLog({
      taskId,
      type: 'system',
      content: '用户跳过了此任务'
    })
  }

  /**
   * 阻塞任务以等待用户输入
   */
  async function blockTaskForInput(taskId: string, request: AIFormRequest): Promise<void> {
    const taskStore = useTaskStore()
    const state = executionStates.value.get(taskId)

    // 更新任务状态
    await taskStore.updateTask(taskId, {
      status: 'blocked',
      blockReason: 'waiting_input',
      inputRequest: {
        formSchema: request.formSchema,
        question: request.question,
        requestedAt: new Date().toISOString()
      }
    })

    // 更新执行状态
    if (state) {
      state.status = 'waiting_input'
      state.completedAt = new Date().toISOString()
    }

    // 添加日志
    await addExecutionLog({
      taskId,
      type: 'system',
      content: `任务等待用户输入: ${request.question || request.formSchema.title}`
    })
  }

  /**
   * 处理队列中下一个任务
   */
  async function processNextInQueue(planId: string): Promise<void> {
    const queue = executionQueues.value.get(planId)
    if (!queue) return

    // 清除当前任务
    queue.currentTaskId = null

    // 查找下一个可执行任务
    const nextTaskId = await findNextExecutableTask(planId, queue.pendingTaskIds)

    if (nextTaskId) {
      // 从队列中移除
      const index = queue.pendingTaskIds.indexOf(nextTaskId)
      if (index >= 0) {
        queue.pendingTaskIds.splice(index, 1)
      }

      queue.currentTaskId = nextTaskId

      // 更新排队状态
      const state = executionStates.value.get(nextTaskId)
      if (state && state.status === 'queued') {
        state.status = 'running'
      }

      // 执行下一个任务
      await executeTask(planId, nextTaskId)
    }
  }

  /**
   * 查找下一个可执行任务
   * 跳过阻塞任务，检查依赖关系
   */
  async function findNextExecutableTask(planId: string, candidates: string[]): Promise<string | null> {
    const taskStore = useTaskStore()

    for (const taskId of candidates) {
      const task = taskStore.tasks.find(t => t.id === taskId)
      if (!task) continue

      // 跳过阻塞任务（等待用户输入）
      if (task.status === 'blocked') {
        console.log('[TaskExecution] Skipping blocked task:', task.title)
        continue
      }

      // 检查依赖是否满足
      if (!taskStore.areDependenciesMet(taskId)) {
        console.log('[TaskExecution] Task dependencies not met:', task.title)
        continue
      }

      return taskId
    }
    return null
  }

  /**
   * 停止任务执行
   */
  async function stopTaskExecution(taskId: string): Promise<void> {
    const state = executionStates.value.get(taskId)
    if (!state) return

    // 使用正确的 sessionId 格式调用 agentExecutor.abort
    // 这会同时中止前端状态和通知后端停止执行
    const sessionId = `task-${taskId}`
    agentExecutor.abort(sessionId)

    // 中止本地 abortController（兼容旧逻辑）
    if (abortController.value) {
      abortController.value.abort()
    }

    // 更新状态
    state.status = 'stopped'
    state.completedAt = new Date().toISOString()

    // 先刷新缓冲区中的日志
    await flushPendingLogs(taskId)

    // 添加停止日志
    await addExecutionLog({
      taskId,
      type: 'system',
      content: '任务执行已停止'
    })

    // 更新任务状态
    const taskStore = useTaskStore()
    try {
      await taskStore.updateTask(taskId, { status: 'pending' })
    } catch (statusError) {
      console.warn('[TaskExecution] Failed to update task status while stopping:', statusError)
    }

    // 从队列中移除
    const task = taskStore.tasks.find(t => t.id === taskId)
    if (task) {
      const queue = executionQueues.value.get(task.planId)
      if (queue) {
        if (queue.currentTaskId === taskId) {
          queue.currentTaskId = null
          // 处理下一个任务
          await processNextInQueue(task.planId)
        } else {
          // 从排队中移除
          const index = queue.pendingTaskIds.indexOf(taskId)
          if (index >= 0) {
            queue.pendingTaskIds.splice(index, 1)
          }
        }
      }
    }
  }

  /**
   * 设置当前查看的任务
   */
  function setCurrentViewingTask(taskId: string | null): void {
    currentViewingTaskId.value = taskId
  }

  /**
   * 加载任务历史日志
   * 如果任务正在执行中，不会覆盖内存中的日志（因为内存中的日志是最新的）
   */
  async function loadTaskLogs(taskId: string): Promise<void> {
    try {
      // 检查任务是否正在执行中
      const existingState = executionStates.value.get(taskId)
      if (existingState && (existingState.status === 'running' || existingState.status === 'queued')) {
        // 任务正在执行中，内存中的日志是最新的，不需要从后端加载
        return
      }

      const rustLogs: RustExecutionLog[] = await invoke('list_task_execution_logs', { taskId })

      const state = initExecutionState(taskId)

      // 如果已有日志且数量大于等于后端返回的日志数量，不覆盖（可能内存中更新）
      if (existingState && existingState.logs.length > 0 && existingState.logs.length >= rustLogs.length) {
        return
      }

      // 转换日志格式
      state.logs = rustLogs.map(log => ({
        id: log.id,
        taskId: log.task_id,
        type: log.type as ExecutionLogType,
        content: log.content,
        timestamp: log.created_at,
        metadata: (() => {
          if (!log.metadata) return undefined
          try {
            return JSON.parse(log.metadata)
          } catch {
            return undefined
          }
        })()
      }))

    } catch (error) {
      console.warn('[TaskExecution] Failed to load logs:', error)
    }
  }

  /**
   * 清除任务的执行日志
   */
  async function clearTaskLogs(taskId: string): Promise<void> {
    try {
      await invoke('clear_task_execution_logs', { taskId })

      const state = executionStates.value.get(taskId)
      if (state) {
        state.logs = []
        state.accumulatedContent = ''
        state.accumulatedThinking = ''
        state.toolCalls = []
      }

      // 清除缓冲区
      const buffer = pendingLogBuffers.value.get(taskId)
      if (buffer) {
        if (buffer.flushTimer) {
          clearTimeout(buffer.flushTimer)
        }
        pendingLogBuffers.value.delete(taskId)
      }
    } catch (error) {
      console.warn('[TaskExecution] Failed to clear logs:', error)
    }
  }

  /**
   * 清除计划的执行状态
   */
  function clearPlanExecution(planId: string): void {
    const queue = executionQueues.value.get(planId)
    if (queue) {
      // 清除所有相关任务的状态
      if (queue.currentTaskId) {
        executionStates.value.delete(queue.currentTaskId)
      }
      queue.pendingTaskIds.forEach(taskId => {
        executionStates.value.delete(taskId)
      })
      executionQueues.value.delete(planId)
    }
  }

  return {
    // State
    executionStates,
    executionQueues,
    currentViewingTaskId,

    // Getters
    getExecutionState,
    isTaskExecuting,
    isTaskRunning,
    getExecutionQueue,
    getCurrentRunningTaskId,
    getQueuePosition,
    getTaskLogs,

    // Actions
    initExecutionState,
    enqueueTask,
    executeTask,
    stopTaskExecution,
    submitTaskInput,
    skipBlockedTask,
    setCurrentViewingTask,
    loadTaskLogs,
    clearTaskLogs,
    clearPlanExecution,
    listRecentPlanResults,
    getPlanExecutionProgress,
    clearPlanExecutionResults
  }
})

function parseExecutionResult(content: string): { summary: string; files: string[] } {
  const trimmed = content.trim()
  if (!trimmed) {
    return {
      summary: '任务已执行完成（无详细输出）',
      files: []
    }
  }

  const jsonBlocks = Array.from(trimmed.matchAll(/```json\s*([\s\S]*?)```/g))
  for (let index = jsonBlocks.length - 1; index >= 0; index -= 1) {
    const rawJson = jsonBlocks[index][1]
    try {
      const parsed = JSON.parse(rawJson) as {
        result_summary?: string
        generated_files?: unknown
        modified_files?: unknown
        changed_files?: unknown
      }
      const summary = (parsed.result_summary || '').trim()
      const generatedFiles = normalizeStringArray(parsed.generated_files).map(file => `added:${file}`)
      const modifiedFiles = normalizeStringArray(parsed.modified_files).map(file => `modified:${file}`)
      const changedFiles = normalizeStringArray(parsed.changed_files).map(file => `changed:${file}`)
      const files = uniqueStrings([...generatedFiles, ...modifiedFiles, ...changedFiles])

      if (summary || files.length > 0) {
        return {
          summary: summary || fallbackSummary(trimmed),
          files
        }
      }
    } catch {
      // ignore invalid JSON block and continue fallback parsing
    }
  }

  return {
    summary: fallbackSummary(trimmed),
    files: uniqueStrings(extractFileLinks(trimmed).map(file => `changed:${file}`))
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function fallbackSummary(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 280) {
    return normalized
  }
  return `${normalized.slice(0, 280)}...`
}

function extractFileLinks(content: string): string[] {
  const files: string[] = []

  // markdown 链接: [label](path)
  const markdownLinks = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)
  for (const match of markdownLinks) {
    if (match[1]) {
      files.push(match[1].trim())
    }
  }

  // 代码内路径: `src/foo.ts`
  const inlineCodePaths = content.matchAll(/`([^`\n]+(?:\/|\\)[^`\n]+)`/g)
  for (const match of inlineCodePaths) {
    if (match[1]) {
      files.push(match[1].trim())
    }
  }

  return files
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function buildRecentResultsContext(results: TaskExecutionResultRecord[]): string {
  if (results.length === 0) return ''

  const lines: string[] = []
  lines.push('## 历史任务（参考）')
  lines.push('')

  results.forEach((result, index) => {
    const status = result.result_status === 'success' ? '✓' : '✗'
    lines.push(`${index + 1}. [${status}] ${result.task_title_snapshot}`)
    if (result.result_summary) {
      lines.push(`   摘要: ${fallbackSummary(result.result_summary)}`)
    }
    if (result.fail_reason) {
      lines.push(`   失败: ${result.fail_reason}`)
    }
  })

  return lines.join('\n')
}

/**
 * 构建任务执行提示
 */
function buildExecutionPrompt(task: Task, recentResults: TaskExecutionResultRecord[] = []): string {
  const parts: string[] = []

  parts.push(`# 任务执行`)
  parts.push('')
  const recentContext = buildRecentResultsContext(recentResults)
  if (recentContext) {
    parts.push(recentContext)
    parts.push('')
  }
  parts.push(`## 任务标题`)
  parts.push(task.title)
  parts.push('')

  if (task.description) {
    parts.push(`## 任务描述`)
    parts.push(task.description)
    parts.push('')
  }

  if (task.implementationSteps && task.implementationSteps.length > 0) {
    parts.push(`## 实现步骤`)
    task.implementationSteps.forEach((step, index) => {
      parts.push(`${index + 1}. ${step}`)
    })
    parts.push('')
  }

  if (task.testSteps && task.testSteps.length > 0) {
    parts.push(`## 测试步骤`)
    task.testSteps.forEach((step, index) => {
      parts.push(`${index + 1}. ${step}`)
    })
    parts.push('')
  }

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    parts.push(`## 验收标准`)
    task.acceptanceCriteria.forEach((criteria) => {
      parts.push(`- [ ] ${criteria}`)
    })
    parts.push('')
  }

  // 添加用户之前提交的输入（如果有）
  if (task.inputResponse && Object.keys(task.inputResponse).length > 0) {
    parts.push(`## 用户输入`)
    parts.push(`用户已提供以下信息：`)
    Object.entries(task.inputResponse).forEach(([key, value]) => {
      parts.push(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    })
    parts.push('')
  }

  parts.push(`---`)
  parts.push('')
  parts.push(`请按照以上要求执行任务。`)
  parts.push('')
  parts.push(`**如需用户输入**，输出 JSON：`)
  parts.push('```json')
  parts.push('{"type":"form_request","question":"问题描述","formSchema":{"formId":"id","title":"标题","fields":[{"name":"字段","label":"标签","type":"text"}]}}')
  parts.push('```')
  parts.push('')
  parts.push(`**任务完成时**，输出 JSON：`)
  parts.push('```json')
  parts.push('{"result_summary":"完成摘要","generated_files":[],"modified_files":[]}')
  parts.push('```')

  return parts.join('\n')
}

/**
 * 解析 AI 输出中的表单请求
 */
function parseFormRequest(content: string): AIFormRequest | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1])
    if (parsed.type === 'form_request' && parsed.formSchema) {
      return {
        type: 'form_request',
        question: parsed.question || '需要您的输入',
        formSchema: parsed.formSchema as DynamicFormSchema
      }
    }
  } catch {
    // 解析失败，不是有效的 JSON
  }
  return null
}
