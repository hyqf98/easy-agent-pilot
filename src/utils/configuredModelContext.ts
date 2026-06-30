import type { AgentModelConfig } from '@/stores/agentConfig'
import { resolveKnownContextWindow } from '@/utils/modelContextWindow'

export const DEFAULT_CONTEXT_WINDOW = 128000

function normalizeModelId(modelId?: string | null): string {
  return modelId?.trim().toLowerCase() || ''
}

function collectModelIdAliases(modelId?: string | null): string[] {
  const normalizedModelId = normalizeModelId(modelId)
  if (!normalizedModelId) {
    return []
  }

  const aliases = new Set<string>([normalizedModelId])
  const slashIndex = normalizedModelId.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < normalizedModelId.length - 1) {
    aliases.add(normalizedModelId.slice(slashIndex + 1))
  }

  return Array.from(aliases)
}

function modelIdsMatch(left?: string | null, right?: string | null): boolean {
  const leftAliases = collectModelIdAliases(left)
  const rightAliases = collectModelIdAliases(right)
  if (leftAliases.length === 0 || rightAliases.length === 0) {
    return false
  }

  return leftAliases.some(alias => rightAliases.includes(alias))
}

interface ResolveConfiguredContextWindowOptions {
  runtimeModelId?: string | null
  selectedModelId?: string | null
  agentModelId?: string | null
  fallbackContextWindow?: number
}

function matchConfiguredModel(
  models: AgentModelConfig[],
  modelId?: string | null
): AgentModelConfig | undefined {
  if (collectModelIdAliases(modelId).length === 0) {
    return undefined
  }

  return models
    .filter(model => model.enabled)
    .find(model => modelIdsMatch(model.modelId, modelId))
}

export function findConfiguredModel(
  models: AgentModelConfig[],
  options: ResolveConfiguredContextWindowOptions = {}
): AgentModelConfig | undefined {
  const enabledModels = models.filter(model => model.enabled)
  if (enabledModels.length === 0) {
    return undefined
  }

  const matchById = (modelId?: string | null) => enabledModels.find(model => modelIdsMatch(model.modelId, modelId))

  // 输入框选中的模型优先（设置页配置的上下文窗口），其次运行时上报模型，再退回默认
  return matchById(options.selectedModelId)
    ?? matchById(options.runtimeModelId)
    ?? matchById(options.agentModelId)
    ?? enabledModels.find(model => model.isDefault)
    ?? enabledModels[0]
}

export function resolveConfiguredContextWindow(
  models: AgentModelConfig[],
  options: ResolveConfiguredContextWindowOptions = {}
): number {
  // 输入框选中模型（设置页配置）优先命中，使容量上限反映用户当前选择
  const selectedConfiguredModel = matchConfiguredModel(models, options.selectedModelId)
  if (selectedConfiguredModel?.contextWindow) {
    return selectedConfiguredModel.contextWindow
  }

  const selectedKnownContext = resolveKnownContextWindow(options.selectedModelId)
  if (selectedKnownContext) {
    return selectedKnownContext
  }

  const runtimeConfiguredModel = matchConfiguredModel(models, options.runtimeModelId)
  if (runtimeConfiguredModel?.contextWindow) {
    return runtimeConfiguredModel.contextWindow
  }

  const runtimeKnownContext = resolveKnownContextWindow(options.runtimeModelId)
  if (runtimeKnownContext) {
    return runtimeKnownContext
  }

  return matchConfiguredModel(models, options.agentModelId)?.contextWindow
    ?? findConfiguredModel(models, options)?.contextWindow
    ?? resolveKnownContextWindow(options.agentModelId)
    ?? options.fallbackContextWindow
    ?? DEFAULT_CONTEXT_WINDOW
}
