import type { AgentModelConfig } from '@/stores/agentConfig'
import { resolveKnownContextWindow } from '@/utils/modelContextWindow'

export const DEFAULT_CONTEXT_WINDOW = 128000

function normalizeModelId(modelId?: string | null): string {
  return modelId?.trim().toLowerCase() || ''
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
  const normalizedModelId = normalizeModelId(modelId)
  if (!normalizedModelId) {
    return undefined
  }

  return models
    .filter(model => model.enabled)
    .find(model => normalizeModelId(model.modelId) === normalizedModelId)
}

export function findConfiguredModel(
  models: AgentModelConfig[],
  options: ResolveConfiguredContextWindowOptions = {}
): AgentModelConfig | undefined {
  const enabledModels = models.filter(model => model.enabled)
  if (enabledModels.length === 0) {
    return undefined
  }

  const runtimeModelId = normalizeModelId(options.runtimeModelId)
  const selectedModelId = normalizeModelId(options.selectedModelId)
  const agentModelId = normalizeModelId(options.agentModelId)

  const matchById = (modelId: string) => enabledModels.find(model => normalizeModelId(model.modelId) === modelId)

  return matchById(runtimeModelId)
    ?? matchById(selectedModelId)
    ?? matchById(agentModelId)
    ?? enabledModels.find(model => model.isDefault)
    ?? enabledModels[0]
}

export function resolveConfiguredContextWindow(
  models: AgentModelConfig[],
  options: ResolveConfiguredContextWindowOptions = {}
): number {
  const runtimeConfiguredModel = matchConfiguredModel(models, options.runtimeModelId)
  if (runtimeConfiguredModel?.contextWindow) {
    return runtimeConfiguredModel.contextWindow
  }

  const runtimeKnownContext = resolveKnownContextWindow(options.runtimeModelId)
  if (runtimeKnownContext) {
    return runtimeKnownContext
  }

  return matchConfiguredModel(models, options.selectedModelId)?.contextWindow
    ?? matchConfiguredModel(models, options.agentModelId)?.contextWindow
    ?? findConfiguredModel(models, options)?.contextWindow
    ?? resolveKnownContextWindow(options.runtimeModelId)
    ?? resolveKnownContextWindow(options.selectedModelId)
    ?? resolveKnownContextWindow(options.agentModelId)
    ?? options.fallbackContextWindow
    ?? DEFAULT_CONTEXT_WINDOW
}
