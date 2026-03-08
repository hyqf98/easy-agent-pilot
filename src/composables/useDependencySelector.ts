import type { Task } from '@/types/plan'

/**
 * 检查添加依赖是否会导致循环依赖
 * @param taskId 当前任务 ID
 * @param dependencyId 要添加的依赖任务 ID
 * @param allTasks 计划内所有任务
 * @returns true 表示会导致循环依赖
 */
export function checkCircularDependency(
  taskId: string,
  dependencyId: string,
  allTasks: Task[]
): boolean {
  // 不能依赖自己
  if (taskId === dependencyId) {
    return true
  }

  // 检查 dependencyId 的依赖链中是否包含 taskId
  const visited = new Set<string>()
  const queue: string[] = [dependencyId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (currentId === taskId) {
      return true
    }

    if (visited.has(currentId)) {
      continue
    }
    visited.add(currentId)

    const currentTask = allTasks.find(t => t.id === currentId)
    if (currentTask?.dependencies) {
      for (const depId of currentTask.dependencies) {
        if (!visited.has(depId)) {
          queue.push(depId)
        }
      }
    }
  }

  return false
}

/**
 * 获取可选的依赖任务列表
 * @param currentTaskId 当前任务 ID（排除自己）
 * @param planId 计划 ID
 * @param allTasks 所有任务
 * @returns 可选的任务列表
 */
export function getAvailableDependencies(
  currentTaskId: string,
  planId: string,
  allTasks: Task[]
): Task[] {
  return allTasks.filter(
    task => task.planId === planId && task.id !== currentTaskId
  )
}

/**
 * Composable for dependency selection logic
 */
export function useDependencySelector() {
  return {
    checkCircularDependency,
    getAvailableDependencies
  }
}
