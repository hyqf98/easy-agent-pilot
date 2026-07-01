import { describe, it, expect } from 'vitest'
import { resolveConfiguredContextWindow, findConfiguredModel, DEFAULT_CONTEXT_WINDOW } from './configuredModelContext'
import type { AgentModelConfig } from '@/stores/agentConfig'

function buildModel(overrides: Partial<AgentModelConfig> & { id: string }): AgentModelConfig {
  return {
    agentId: 'agent-1',
    modelId: 'provider/model-a',
    displayName: 'Model A',
    isDefault: false,
    enabled: true,
    contextWindow: 128000,
    ...overrides
  } as AgentModelConfig
}

describe('resolveConfiguredContextWindow', () => {
  it('命中选中模型的 contextWindow', () => {
    const models = [buildModel({ id: '1', modelId: 'p/a', contextWindow: 200000 })]
    expect(resolveConfiguredContextWindow(models, { selectedModelId: 'p/a' })).toBe(200000)
  })

  it('重复 modelId 时取 contextWindow 最大的（问题1修复）', () => {
    const models = [
      buildModel({ id: '1', modelId: 'modelhub/glm-5.2', contextWindow: 128000, isDefault: true }),
      buildModel({ id: '2', modelId: 'modelhub/glm-5.2', contextWindow: 1000000 })
    ]
    // 无论命中顺序如何，都应取 1000000（用户特意调大的准确值），而非 find 的第一条 128000
    expect(resolveConfiguredContextWindow(models, { selectedModelId: 'modelhub/glm-5.2' })).toBe(1000000)
    expect(resolveConfiguredContextWindow(models, { runtimeModelId: 'modelhub/glm-5.2' })).toBe(1000000)
  })

  it('未命中选中/运行时模型时，回退到唯一启用模型的 contextWindow', () => {
    // selectedModelId/runtimeModelId 都不匹配，但存在唯一启用模型 → 回退到该模型
    const models = [buildModel({ id: '1', modelId: 'p/a', contextWindow: 200000 })]
    expect(resolveConfiguredContextWindow(models, {
      selectedModelId: 'p/unknown',
      runtimeModelId: 'p/unknown2'
    })).toBe(200000)
  })

  it('无任何启用模型时回退到 DEFAULT_CONTEXT_WINDOW', () => {
    const models = [buildModel({ id: '1', modelId: 'p/a', contextWindow: 200000, enabled: false })]
    expect(resolveConfiguredContextWindow(models, { selectedModelId: 'p/a' })).toBe(DEFAULT_CONTEXT_WINDOW)
  })

  it('禁用的模型不参与匹配', () => {
    const models = [buildModel({ id: '1', modelId: 'p/a', contextWindow: 200000, enabled: false })]
    expect(resolveConfiguredContextWindow(models, { selectedModelId: 'p/a' })).toBe(DEFAULT_CONTEXT_WINDOW)
  })
})

describe('findConfiguredModel', () => {
  it('优先返回选中模型', () => {
    const models = [
      buildModel({ id: '1', modelId: 'p/a' }),
      buildModel({ id: '2', modelId: 'p/b', isDefault: true })
    ]
    const found = findConfiguredModel(models, { selectedModelId: 'p/a' })
    expect(found?.modelId).toBe('p/a')
  })

  it('重复 modelId 时返回 contextWindow 最大的', () => {
    const models = [
      buildModel({ id: '1', modelId: 'p/a', contextWindow: 128000 }),
      buildModel({ id: '2', modelId: 'p/a', contextWindow: 256000 })
    ]
    const found = findConfiguredModel(models, { selectedModelId: 'p/a' })
    expect(found?.id).toBe('2')
    expect(found?.contextWindow).toBe(256000)
  })

  it('无匹配时回退到默认模型', () => {
    const models = [
      buildModel({ id: '1', modelId: 'p/a' }),
      buildModel({ id: '2', modelId: 'p/b', isDefault: true })
    ]
    const found = findConfiguredModel(models, { selectedModelId: 'p/unknown' })
    expect(found?.modelId).toBe('p/b')
  })
})
