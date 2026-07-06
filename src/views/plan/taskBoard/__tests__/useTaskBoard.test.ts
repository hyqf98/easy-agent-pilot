import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Task } from '@/types/plan'

// ── 共享 mock 单例（各 store 工厂返回同一个对象，便于断言） ─────────────
const taskExecutionMock = {
  isTaskRunning: vi.fn(() => false),
  startTaskExecution: vi.fn(async () => undefined),
  getExecutionState: vi.fn(() => ({ status: 'idle' })),
  getExecutionQueue: vi.fn(() => undefined),
  clearTaskLogs: vi.fn(async () => undefined),
  detachTaskFromExecution: vi.fn(async () => undefined),
  synchronizePlanExecutionQueue: vi.fn(async () => undefined)
}

const taskStoreMock = {
  tasks: [] as Task[],
  areDependenciesMet: vi.fn(() => true),
  getUnmetDependencyTitles: vi.fn(() => []),
  updateTask: vi.fn(async () => undefined),
  reorderTasks: vi.fn(async () => undefined),
  deleteTask: vi.fn(async () => undefined),
  createTask: vi.fn(async () => undefined),
  loadTasks: vi.fn(async () => undefined),
  loadProjectLooseTasks: vi.fn(async () => undefined),
  getProjectLooseTasks: vi.fn((): Task[] => []),
  setCurrentTask: vi.fn()
}

const planStoreMock = {
  currentPlanId: 'plan-1' as string | null,
  currentPlan: { id: 'plan-1', splitMode: 'manual', executionStatus: 'running' },
  plans: [],
  startPlanExecution: vi.fn(async () => undefined),
  markPlanAsReady: vi.fn(async () => undefined),
  setCurrentPlan: vi.fn(),
  updatePlan: vi.fn(async () => undefined)
}

const projectStoreMock = {
  currentProjectId: 'project-1' as string | null
}

const notificationStoreMock = {
  warning: vi.fn(),
  databaseError: vi.fn()
}

const confirmDialogMock = {
  show: vi.fn(async () => undefined),
  danger: vi.fn(async () => true)
}

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@/services/conversation/AgentExecutor', () => ({
  agentExecutor: { abort: vi.fn(), execute: vi.fn(), isSupported: vi.fn(() => true) }
}))
vi.mock('@/services/usage/agentCliUsageRecorder', () => ({
  recordAgentCliUsageInBackground: vi.fn()
}))

vi.mock('@/stores/taskExecution', () => ({
  useTaskExecutionStore: () => taskExecutionMock
}))
vi.mock('@/stores/task', () => ({
  useTaskStore: () => taskStoreMock
}))
vi.mock('@/stores/plan', () => ({
  usePlanStore: () => planStoreMock
}))
vi.mock('@/stores/project', () => ({
  useProjectStore: () => projectStoreMock
}))
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => notificationStoreMock
}))
vi.mock('@/composables', () => ({
  useConfirmDialog: () => confirmDialogMock
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

function createTask(id: string, overrides: Partial<Task> = {}): Task {
  const now = '2026-03-28T00:00:00.000Z'
  return {
    id,
    planId: 'plan-1',
    title: id,
    status: 'pending',
    priority: 'medium',
    order: 0,
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

async function loadUseTaskBoard() {
  const mod = await import('../useTaskBoard')
  return mod.useTaskBoard({ emit: vi.fn() })
}

describe('useTaskBoard 拖拽与重排流程', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    planStoreMock.currentPlanId = 'plan-1'
    planStoreMock.currentPlan = { id: 'plan-1', splitMode: 'manual', executionStatus: 'running' }
  })

  it('pending→in_progress 触发一次任务执行并更新任务状态', async () => {
    const task = createTask('task-1', { order: 0 })
    taskStoreMock.tasks = [task]
    taskExecutionMock.isTaskRunning.mockReturnValue(false)
    taskStoreMock.areDependenciesMet.mockReturnValue(true)

    const board = await loadUseTaskBoard()
    await board.handleTaskDrop('task-1', 'in_progress')

    expect(taskExecutionMock.startTaskExecution).toHaveBeenCalledTimes(1)
    expect(taskExecutionMock.startTaskExecution).toHaveBeenCalledWith('task-1')
    expect(taskStoreMock.updateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: 'in_progress' })
    )
  })

  it('运行中的任务再次拖拽不重复触发执行', async () => {
    const task = createTask('task-1', { status: 'in_progress', order: 0 })
    taskStoreMock.tasks = [task]
    taskExecutionMock.isTaskRunning.mockReturnValue(true)

    const board = await loadUseTaskBoard()
    await board.handleTaskDrop('task-1', 'completed')

    expect(taskExecutionMock.startTaskExecution).not.toHaveBeenCalled()
  })

  it('同列内重排重新计算 order 并调用 reorderTasks', async () => {
    const t0 = createTask('t0', { status: 'pending', order: 0 })
    const t1 = createTask('t1', { status: 'pending', order: 1 })
    const t2 = createTask('t2', { status: 'pending', order: 2 })
    taskStoreMock.tasks = [t0, t1, t2]
    taskExecutionMock.isTaskRunning.mockReturnValue(false)

    const board = await loadUseTaskBoard()
    // 把 t2 移到 index 0
    await board.handleTaskReorder('t2', 0)

    expect(taskStoreMock.reorderTasks).toHaveBeenCalledTimes(1)
    const orderArg = (taskStoreMock.reorderTasks as any).mock.calls[0][0]
    // 重排后顺序应为 [t2, t0, t1] → order 0/1/2
    expect(orderArg).toEqual([
      { id: 't2', order: 0 },
      { id: 't0', order: 1 },
      { id: 't1', order: 2 }
    ])
  })

  it('未绑定计划的 detached 任务拖到 in_progress 时回滚并告警', async () => {
    const task = createTask('task-1', { order: 0, planId: '' })
    // currentPlanId 为 null → 走项目游离任务路径
    planStoreMock.currentPlanId = null
    projectStoreMock.currentProjectId = 'project-1'
    taskStoreMock.getProjectLooseTasks.mockReturnValue([task])
    taskStoreMock.tasks = [task]
    taskExecutionMock.isTaskRunning.mockReturnValue(false)
    taskStoreMock.areDependenciesMet.mockReturnValue(true)

    const board = await loadUseTaskBoard()
    await board.handleTaskDrop('task-1', 'in_progress')

    expect(taskExecutionMock.startTaskExecution).not.toHaveBeenCalled()
    // 任务状态回滚为 pending
    expect(task.status).toBe('pending')
    expect(notificationStoreMock.warning).toHaveBeenCalled()
  })
})
