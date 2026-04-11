import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Plan, Task } from '@/types/plan'
import { DEFAULT_SPLIT_GRANULARITY } from '@/constants/plan'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

vi.mock('@/services/conversation/AgentExecutor', () => ({
  agentExecutor: {
    abort: vi.fn(),
    execute: vi.fn(),
    isSupported: vi.fn(() => true)
  }
}))

vi.mock('@/services/usage/agentCliUsageRecorder', () => ({
  recordAgentCliUsageInBackground: vi.fn()
}))

function createPlan(overrides: Partial<Plan> = {}): Plan {
  const now = '2026-03-28T00:00:00.000Z'

  return {
    id: 'plan-1',
    projectId: 'project-1',
    name: 'Regression Plan',
    memoryLibraryIds: [],
    splitMode: 'manual',
    status: 'executing',
    executionStatus: 'running',
    currentTaskId: undefined,
    granularity: DEFAULT_SPLIT_GRANULARITY,
    maxRetryCount: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function createTask(id: string, overrides: Partial<Task> = {}): Task {
  const now = '2026-03-28T00:00:00.000Z'

  return {
    id,
    planId: 'plan-1',
    title: id,
    status: 'in_progress',
    priority: 'medium',
    order: 0,
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

async function loadStores() {
  const [{ useTaskExecutionStore }, { useTaskStore }, { usePlanStore }] = await Promise.all([
    import('@/stores/taskExecution'),
    import('@/stores/task'),
    import('@/stores/plan')
  ])

  return {
    useTaskExecutionStore,
    useTaskStore,
    usePlanStore
  }
}

function installEnvironmentMocks(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0
    },
    configurable: true
  })

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      language: 'zh-CN',
      platform: 'MacIntel',
      userAgent: 'Vitest'
    },
    configurable: true
  })

  Object.defineProperty(globalThis, 'document', {
    value: {
      documentElement: {
        lang: 'zh-CN',
        style: {
          setProperty: vi.fn()
        }
      }
    },
    configurable: true
  })

  Object.defineProperty(globalThis, 'window', {
    value: {
      setTimeout,
      clearTimeout,
      __TAURI_INTERNALS__: {
        invoke: vi.fn().mockResolvedValue({}),
        transformCallback: vi.fn(),
        unregisterCallback: vi.fn()
      }
    },
    configurable: true
  })
}

describe('useTaskExecutionStore queue synchronization', () => {
  beforeEach(() => {
    vi.resetModules()
    installEnvironmentMocks()
    setActivePinia(createPinia())
  })

  it('keeps queued siblings runnable after detaching a stopped task', async () => {
    const { useTaskExecutionStore, useTaskStore, usePlanStore } = await loadStores()
    const taskExecutionStore = useTaskExecutionStore()
    const taskStore = useTaskStore()
    const planStore = usePlanStore()

    const plan = createPlan({
      executionStatus: 'paused',
      currentTaskId: 'task-stopped'
    })
    const stoppedTask = createTask('task-stopped', { order: 0 })
    const queuedTask = createTask('task-queued', { order: 1 })

    planStore.plans = [plan]
    taskStore.tasks = [stoppedTask, queuedTask]
    planStore.updatePlan = vi.fn(async (id, updates) => {
      const currentPlan = planStore.plans.find(item => item.id === id)
      if (!currentPlan) {
        throw new Error('Plan not found')
      }

      Object.assign(currentPlan, updates)
      return currentPlan
    })

    taskExecutionStore.executionQueues.set(plan.id, {
      planId: plan.id,
      currentTaskId: null,
      pendingTaskIds: [queuedTask.id],
      isPaused: false,
      lastInterruptedTaskId: stoppedTask.id
    })
    taskExecutionStore.initExecutionState(stoppedTask.id).status = 'stopped'
    taskExecutionStore.initExecutionState(queuedTask.id).status = 'queued'

    await taskExecutionStore.detachTaskFromExecution(stoppedTask.id)

    expect(taskExecutionStore.getExecutionQueue(plan.id)).toMatchObject({
      currentTaskId: null,
      pendingTaskIds: [queuedTask.id],
      lastInterruptedTaskId: null
    })
    expect(planStore.plans[0]?.executionStatus).toBe('running')
    expect(planStore.plans[0]?.currentTaskId).toBeUndefined()
  })

  it('rebuilds queue order after stale in-progress references are removed', async () => {
    const { useTaskExecutionStore, useTaskStore, usePlanStore } = await loadStores()
    const taskExecutionStore = useTaskExecutionStore()
    const taskStore = useTaskStore()
    const planStore = usePlanStore()

    const plan = createPlan({
      currentTaskId: 'task-removed'
    })
    const removedTask = createTask('task-removed', {
      status: 'pending',
      order: 2
    })
    const secondTask = createTask('task-second', { order: 1 })
    const firstTask = createTask('task-first', { order: 0 })

    planStore.plans = [plan]
    taskStore.tasks = [removedTask, secondTask, firstTask]
    planStore.updatePlan = vi.fn(async (id, updates) => {
      const currentPlan = planStore.plans.find(item => item.id === id)
      if (!currentPlan) {
        throw new Error('Plan not found')
      }

      Object.assign(currentPlan, updates)
      return currentPlan
    })

    taskExecutionStore.executionQueues.set(plan.id, {
      planId: plan.id,
      currentTaskId: removedTask.id,
      pendingTaskIds: [removedTask.id, secondTask.id, firstTask.id],
      isPaused: false,
      lastInterruptedTaskId: removedTask.id
    })
    taskExecutionStore.initExecutionState(secondTask.id).status = 'stopped'
    taskExecutionStore.initExecutionState(firstTask.id).status = 'idle'

    await taskExecutionStore.synchronizePlanExecutionQueue(plan.id)

    expect(taskExecutionStore.getExecutionQueue(plan.id)).toMatchObject({
      currentTaskId: null,
      pendingTaskIds: [firstTask.id, secondTask.id],
      lastInterruptedTaskId: null
    })
    expect(taskExecutionStore.getExecutionState(firstTask.id)?.status).toBe('queued')
    expect(taskExecutionStore.getExecutionState(secondTask.id)?.status).toBe('queued')
    expect(planStore.plans[0]?.executionStatus).toBe('running')
    expect(planStore.plans[0]?.currentTaskId).toBeUndefined()
  })
})
