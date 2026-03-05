import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { getErrorMessage } from '@/utils/api'
import type {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  AgentRole,
  TaskOrderItem
} from '@/types/plan'

// Rust 后端返回的 snake_case 结构
interface RustTask {
  id: string
  plan_id: string
  parent_id?: string
  title: string
  description?: string
  status: string
  priority: string
  assignee?: string
  session_id?: string
  progress_file?: string
  dependencies?: string // JSON 字符串
  task_order: number
  retry_count: number
  max_retries: number
  error_message?: string
  implementation_steps?: string // JSON 字符串
  test_steps?: string // JSON 字符串
  acceptance_criteria?: string // JSON 字符串
  created_at: string
  updated_at: string
}

// 将 Rust 返回的 snake_case 转换为 camelCase
function transformTask(rustTask: RustTask): Task {
  let dependencies: string[] | undefined
  if (rustTask.dependencies) {
    try {
      dependencies = JSON.parse(rustTask.dependencies)
    } catch {
      // ignore parse error
    }
  }

  let implementationSteps: string[] | undefined
  if (rustTask.implementation_steps) {
    try {
      implementationSteps = JSON.parse(rustTask.implementation_steps)
    } catch {
      // ignore parse error
    }
  }

  let testSteps: string[] | undefined
  if (rustTask.test_steps) {
    try {
      testSteps = JSON.parse(rustTask.test_steps)
    } catch {
      // ignore parse error
    }
  }

  let acceptanceCriteria: string[] | undefined
  if (rustTask.acceptance_criteria) {
    try {
      acceptanceCriteria = JSON.parse(rustTask.acceptance_criteria)
    } catch {
      // ignore parse error
    }
  }

  return {
    id: rustTask.id,
    planId: rustTask.plan_id,
    parentId: rustTask.parent_id,
    title: rustTask.title,
    description: rustTask.description,
    status: rustTask.status as TaskStatus,
    priority: rustTask.priority as TaskPriority,
    assignee: rustTask.assignee as AgentRole | undefined,
    sessionId: rustTask.session_id,
    progressFile: rustTask.progress_file,
    dependencies,
    order: rustTask.task_order,
    retryCount: rustTask.retry_count,
    maxRetries: rustTask.max_retries,
    errorMessage: rustTask.error_message,
    implementationSteps,
    testSteps,
    acceptanceCriteria,
    createdAt: rustTask.created_at,
    updatedAt: rustTask.updated_at
  }
}

export const useTaskStore = defineStore('task', () => {
  // State
  const tasks = ref<Task[]>([])
  const currentTaskId = ref<string | null>(null)
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  // Getters
  const currentTask = computed(() =>
    tasks.value.find(t => t.id === currentTaskId.value)
  )

  // 按计划分组的任务
  const tasksByPlan = computed(() => {
    return (planId: string) => {
      return tasks.value
        .filter(t => t.planId === planId)
        .sort((a, b) => a.order - b.order)
    }
  })

  // 按状态分组的任务（看板视图）
  const tasksByStatus = computed(() => {
    return (planId: string) => {
      const result: Record<TaskStatus, Task[]> = {
        pending: [],
        in_progress: [],
        completed: [],
        blocked: [],
        cancelled: []
      }

      tasks.value
        .filter(t => t.planId === planId)
        .forEach(t => {
          if (result[t.status]) {
            result[t.status].push(t)
          }
        })

      // 每个分组内按顺序排序
      Object.keys(result).forEach(status => {
        result[status as TaskStatus].sort((a, b) => a.order - b.order)
      })

      return result
    }
  })

  // 获取根任务（没有父任务的任务）
  const rootTasks = computed(() => {
    return (planId: string) => {
      return tasks.value
        .filter(t => t.planId === planId && !t.parentId)
        .sort((a, b) => a.order - b.order)
    }
  })

  // 获取子任务
  const subtasks = computed(() => {
    return (parentId: string) => {
      return tasks.value
        .filter(t => t.parentId === parentId)
        .sort((a, b) => a.order - b.order)
    }
  })

  // Actions
  async function loadTasks(planId: string) {
    isLoading.value = true
    loadError.value = null
    const notificationStore = useNotificationStore()
    try {
      const rustTasks = await invoke<RustTask[]>('list_tasks', { planId })
      tasks.value = rustTasks.map(transformTask)
    } catch (error) {
      console.error('Failed to load tasks:', error)
      tasks.value = []
      loadError.value = getErrorMessage(error)
      notificationStore.networkError(
        '加载任务列表',
        getErrorMessage(error),
        () => loadTasks(planId)
      )
    } finally {
      isLoading.value = false
    }
  }

  async function getTask(id: string): Promise<Task | null> {
    try {
      const rustTask = await invoke<RustTask>('get_task', { id })
      return transformTask(rustTask)
    } catch (error) {
      console.error('Failed to get task:', error)
      return null
    }
  }

  // 根据会话 ID 获取关联的任务
  async function getTaskBySessionId(sessionId: string): Promise<Task | null> {
    try {
      const rustTask = await invoke<RustTask | null>('get_task_by_session_id', { sessionId })
      if (rustTask) {
        const task = transformTask(rustTask)
        // 合并到本地状态
        const existingIndex = tasks.value.findIndex(t => t.id === task.id)
        if (existingIndex === -1) {
          tasks.value.push(task)
        } else {
          tasks.value[existingIndex] = task
        }
        return task
      }
      return null
    } catch (error) {
      console.error('Failed to get task by session id:', error)
      return null
    }
  }

  async function createTask(input: CreateTaskInput): Promise<Task> {
    const notificationStore = useNotificationStore()
    const rustInput = {
      plan_id: input.planId,
      parent_id: input.parentId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? null,
      assignee: input.assignee ?? null,
      dependencies: input.dependencies ?? null,
      order: input.order ?? null,
      max_retries: input.maxRetries ?? null,
      implementation_steps: input.implementationSteps ? JSON.stringify(input.implementationSteps) : null,
      test_steps: input.testSteps ? JSON.stringify(input.testSteps) : null,
      acceptance_criteria: input.acceptanceCriteria ? JSON.stringify(input.acceptanceCriteria) : null
    }

    try {
      const rustTask = await invoke<RustTask>('create_task', { input: rustInput })
      const newTask = transformTask(rustTask)
      tasks.value.push(newTask)
      // 重新排序
      sortTasks()
      return newTask
    } catch (error) {
      console.error('Failed to create task:', error)
      notificationStore.databaseError(
        '创建任务失败',
        getErrorMessage(error),
        async () => { await createTask(input) }
      )
      throw error
    }
  }

  async function updateTask(id: string, updates: UpdateTaskInput): Promise<Task> {
    const notificationStore = useNotificationStore()
    const input = {
      title: updates.title ?? null,
      description: updates.description ?? null,
      status: updates.status ?? null,
      priority: updates.priority ?? null,
      assignee: updates.assignee ?? null,
      session_id: updates.sessionId ?? null,
      progress_file: updates.progressFile ?? null,
      dependencies: updates.dependencies ?? null,
      order: updates.order ?? null,
      retry_count: updates.retryCount ?? null,
      max_retries: updates.maxRetries ?? null,
      error_message: updates.errorMessage ?? null,
      implementation_steps: updates.implementationSteps ? JSON.stringify(updates.implementationSteps) : null,
      test_steps: updates.testSteps ? JSON.stringify(updates.testSteps) : null,
      acceptance_criteria: updates.acceptanceCriteria ? JSON.stringify(updates.acceptanceCriteria) : null
    }

    try {
      const rustTask = await invoke<RustTask>('update_task', { id, input })
      const updatedTask = transformTask(rustTask)

      const index = tasks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tasks.value[index] = updatedTask
      }

      return updatedTask
    } catch (error) {
      console.error('Failed to update task:', error)
      notificationStore.databaseError(
        '更新任务失败',
        getErrorMessage(error),
        async () => { await updateTask(id, updates) }
      )
      throw error
    }
  }

  async function deleteTask(id: string): Promise<void> {
    const notificationStore = useNotificationStore()

    try {
      await invoke('delete_task', { id })

      const index = tasks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tasks.value.splice(index, 1)
      }

      if (currentTaskId.value === id) {
        currentTaskId.value = null
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
      notificationStore.databaseError(
        '删除任务失败',
        getErrorMessage(error),
        async () => { await deleteTask(id) }
      )
      throw error
    }
  }

  // 批量更新任务顺序
  async function reorderTasks(taskOrders: TaskOrderItem[]): Promise<void> {
    const notificationStore = useNotificationStore()

    try {
      await invoke('reorder_tasks', {
        input: { task_orders: taskOrders }
      })

      // 更新本地状态
      taskOrders.forEach(item => {
        const task = tasks.value.find(t => t.id === item.id)
        if (task) {
          task.order = item.order
        }
      })

      // 重新排序
      sortTasks()
    } catch (error) {
      console.error('Failed to reorder tasks:', error)
      notificationStore.databaseError(
        '更新任务顺序失败',
        getErrorMessage(error),
        async () => { await reorderTasks(taskOrders) }
      )
      throw error
    }
  }

  // 获取子任务
  async function loadSubtasks(parentId: string): Promise<Task[]> {
    try {
      const rustTasks = await invoke<RustTask[]>('list_subtasks', { parentId })
      const subtasks = rustTasks.map(transformTask)

      // 合并到本地状态
      subtasks.forEach(st => {
        const index = tasks.value.findIndex(t => t.id === st.id)
        if (index !== -1) {
          tasks.value[index] = st
        } else {
          tasks.value.push(st)
        }
      })

      return subtasks
    } catch (error) {
      console.error('Failed to load subtasks:', error)
      return []
    }
  }

  function setCurrentTask(id: string | null) {
    currentTaskId.value = id
  }

  // 内部排序函数
  function sortTasks() {
    tasks.value.sort((a, b) => a.order - b.order)
  }

  // 检查任务的依赖是否都已完成
  function areDependenciesMet(taskId: string): boolean {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task?.dependencies || task.dependencies.length === 0) {
      return true
    }

    return task.dependencies.every(depId => {
      const depTask = tasks.value.find(t => t.id === depId)
      return depTask?.status === 'completed'
    })
  }

  // 获取可以开始的任务（依赖已满足且状态为 pending）
  function getReadyTasks(planId: string): Task[] {
    return tasks.value
      .filter(t => t.planId === planId && t.status === 'pending')
      .filter(t => areDependenciesMet(t.id))
      .sort((a, b) => a.order - b.order)
  }

  // 批量启动待办任务
  async function batchStartTasks(planId: string): Promise<Task[]> {
    const notificationStore = useNotificationStore()

    try {
      const rustTasks = await invoke<RustTask[]>('batch_update_status', {
        planId,
        status: 'in_progress'
      })

      const updatedTasks = rustTasks.map(transformTask)

      // 更新本地状态
      updatedTasks.forEach(updatedTask => {
        const index = tasks.value.findIndex(t => t.id === updatedTask.id)
        if (index !== -1) {
          tasks.value[index] = updatedTask
        }
      })

      return updatedTasks
    } catch (error) {
      console.error('Failed to batch start tasks:', error)
      notificationStore.databaseError(
        '批量启动任务失败',
        getErrorMessage(error),
        async () => { await batchStartTasks(planId) }
      )
      throw error
    }
  }

  // 重试失败任务
  async function retryTask(taskId: string): Promise<Task> {
    const notificationStore = useNotificationStore()

    try {
      const rustTask = await invoke<RustTask>('retry_task', { id: taskId })
      const updatedTask = transformTask(rustTask)

      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index !== -1) {
        tasks.value[index] = updatedTask
      }

      return updatedTask
    } catch (error) {
      console.error('Failed to retry task:', error)
      notificationStore.databaseError(
        '重试任务失败',
        getErrorMessage(error),
        async () => { await retryTask(taskId) }
      )
      throw error
    }
  }

  // 停止执行中任务
  async function stopTask(taskId: string): Promise<Task> {
    const notificationStore = useNotificationStore()

    try {
      const rustTask = await invoke<RustTask>('stop_task', { id: taskId })
      const updatedTask = transformTask(rustTask)

      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index !== -1) {
        tasks.value[index] = updatedTask
      }

      return updatedTask
    } catch (error) {
      console.error('Failed to stop task:', error)
      notificationStore.databaseError(
        '停止任务失败',
        getErrorMessage(error),
        async () => { await stopTask(taskId) }
      )
      throw error
    }
  }

  // 从拆分结果创建任务
  async function createTasksFromSplit(planId: string, taskInputs: CreateTaskInput[]): Promise<Task[]> {
    const notificationStore = useNotificationStore()

    // 转换输入格式
    const rustInputs = taskInputs.map(input => ({
      plan_id: planId,
      parent_id: input.parentId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? null,
      assignee: input.assignee ?? null,
      dependencies: input.dependencies ?? null,
      order: input.order ?? null,
      max_retries: input.maxRetries ?? null,
      implementation_steps: input.implementationSteps ? JSON.stringify(input.implementationSteps) : null,
      test_steps: input.testSteps ? JSON.stringify(input.testSteps) : null,
      acceptance_criteria: input.acceptanceCriteria ? JSON.stringify(input.acceptanceCriteria) : null
    }))

    try {
      const rustTasks = await invoke<RustTask[]>('batch_create_tasks', {
        planId,
        tasks: rustInputs
      })

      const newTasks = rustTasks.map(transformTask)

      // 添加到本地状态
      newTasks.forEach(task => {
        const existingIndex = tasks.value.findIndex(t => t.id === task.id)
        if (existingIndex === -1) {
          tasks.value.push(task)
        }
      })

      // 重新排序
      sortTasks()

      return newTasks
    } catch (error) {
      console.error('Failed to create tasks from split:', error)
      notificationStore.databaseError(
        '创建任务失败',
        getErrorMessage(error),
        async () => { await createTasksFromSplit(planId, taskInputs) }
      )
      throw error
    }
  }

  return {
    // State
    tasks,
    currentTaskId,
    isLoading,
    loadError,
    // Getters
    currentTask,
    tasksByPlan,
    tasksByStatus,
    rootTasks,
    subtasks,
    // Actions
    loadTasks,
    getTask,
    getTaskBySessionId,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    loadSubtasks,
    setCurrentTask,
    areDependenciesMet,
    getReadyTasks,
    // 批量操作
    batchStartTasks,
    retryTask,
    stopTask,
    createTasksFromSplit
  }
})
