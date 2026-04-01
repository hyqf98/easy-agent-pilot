import type { Plan } from '@/types/plan'
import type { PlanExecutionProgress, PlanExecutionTaskProgress } from '@/types/taskExecution'
import { groupTaskResultFiles } from '@/utils/taskExecutionResult'

export interface PlanExecutionFileGroups {
  generatedFiles: string[]
  modifiedFiles: string[]
  changedFiles: string[]
  deletedFiles: string[]
}

export interface PlanExecutionSnapshot {
  totalTasks: number
  currentTaskIndex: number | null
  orderedTasks: PlanExecutionTaskProgress[]
  completedTasks: PlanExecutionTaskProgress[]
  failedTasks: PlanExecutionTaskProgress[]
  activeTask: PlanExecutionTaskProgress | null
  fileGroups: PlanExecutionFileGroups
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function sortPlanExecutionTasks(tasks: PlanExecutionTaskProgress[]): PlanExecutionTaskProgress[] {
  return [...tasks].sort((left, right) => {
    if (left.task_order !== right.task_order) {
      return left.task_order - right.task_order
    }

    return new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime()
  })
}

export function resolvePlanTaskAgentSelection(
  task: Pick<PlanExecutionTaskProgress, 'expert_id' | 'agent_id' | 'model_id'>,
  plan?: Pick<Plan, 'splitExpertId' | 'splitAgentId' | 'splitModelId'> | null
): { expertId?: string, agentId?: string, modelId?: string, source: 'task' | 'plan' | 'none' } {
  if (task.expert_id || task.agent_id || task.model_id) {
    return {
      expertId: task.expert_id ?? undefined,
      agentId: task.agent_id ?? undefined,
      modelId: task.model_id ?? undefined,
      source: 'task'
    }
  }

  if (plan?.splitExpertId || plan?.splitAgentId || plan?.splitModelId) {
    return {
      expertId: plan.splitExpertId ?? undefined,
      agentId: plan.splitAgentId ?? undefined,
      modelId: plan.splitModelId ?? undefined,
      source: 'plan'
    }
  }

  return { source: 'none' }
}

export function aggregatePlanExecutionFiles(tasks: PlanExecutionTaskProgress[]): PlanExecutionFileGroups {
  const generatedFiles: string[] = []
  const modifiedFiles: string[] = []
  const changedFiles: string[] = []
  const deletedFiles: string[] = []

  tasks.forEach((task) => {
    const grouped = groupTaskResultFiles(task.last_result_files ?? [])
    generatedFiles.push(...grouped.generatedFiles)
    modifiedFiles.push(...grouped.modifiedFiles)
    changedFiles.push(...grouped.changedFiles)
    deletedFiles.push(...grouped.deletedFiles)
  })

  return {
    generatedFiles: unique(generatedFiles),
    modifiedFiles: unique(modifiedFiles),
    changedFiles: unique(changedFiles),
    deletedFiles: unique(deletedFiles)
  }
}

export function buildPlanExecutionSnapshot(
  progress: PlanExecutionProgress | null,
  currentTaskId?: string | null
): PlanExecutionSnapshot {
  const orderedTasks = sortPlanExecutionTasks(progress?.tasks ?? [])
  const activeTask = orderedTasks.find(task => task.task_id === currentTaskId)
    ?? orderedTasks.find(task => task.status === 'in_progress')
    ?? null

  return {
    totalTasks: orderedTasks.length,
    currentTaskIndex: activeTask
      ? orderedTasks.findIndex(task => task.task_id === activeTask.task_id) + 1
      : null,
    orderedTasks,
    completedTasks: orderedTasks.filter(task => task.status === 'completed'),
    failedTasks: orderedTasks.filter(task => task.status === 'failed'),
    activeTask,
    fileGroups: aggregatePlanExecutionFiles(orderedTasks)
  }
}
