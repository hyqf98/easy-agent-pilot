import { describe, expect, it } from 'vitest'
import {
  resolveSubAgentExecution,
  resolveSubAgentExecutionWithFallback,
  resolveSubAgentById,
  resolveFallbackAgent,
  buildSubAgentSystemPrompt,
  buildSubAgentCatalogPrompt
} from './runtime'
import type { AgentConfig } from '@/stores/agent'
import type { SubAgent } from '@/stores/subAgent'

function createExecutor(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'exec-1',
    name: 'Claude',
    type: 'acp',
    provider: 'claude',
    acpCommand: 'claude',
    modelId: 'claude-sonnet-4',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function createSubAgent(overrides: Partial<SubAgent> = {}): SubAgent {
  return {
    id: 'sub-1',
    builtinCode: 'builtin-general',
    name: '通用子代理',
    description: '通用协作',
    prompt: '你是一个通用子代理',
    category: 'general',
    tags: ['chat'],
    recommendedScenes: ['主会话'],
    tools: [],
    disallowedTools: [],
    model: undefined,
    permissionMode: undefined,
    maxTurns: undefined,
    isBuiltin: true,
    isSystem: false,
    isEnabled: true,
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

describe('resolveSubAgentExecution', () => {
  it('组装执行上下文：子代理 + 显式执行器 + 模型', () => {
    const sub = createSubAgent()
    const executor = createExecutor({ modelId: 'claude-sonnet-4' })
    const resolved = resolveSubAgentExecution(sub, executor)

    expect(resolved).not.toBeNull()
    expect(resolved!.subAgent).toBe(sub)
    expect(resolved!.agent).toBe(executor)
    // 模型跟随执行器
    expect(resolved!.modelId).toBe('claude-sonnet-4')
  })

  it('子代理专用 model 优先于执行器模型', () => {
    const sub = createSubAgent({ model: 'gpt-4o' })
    const executor = createExecutor({ modelId: 'claude-sonnet-4' })
    const resolved = resolveSubAgentExecution(sub, executor)
    expect(resolved!.modelId).toBe('gpt-4o')
  })

  it('modelIdOverride 优先级最高', () => {
    const sub = createSubAgent({ model: 'gpt-4o' })
    const executor = createExecutor({ modelId: 'claude-sonnet-4' })
    const resolved = resolveSubAgentExecution(sub, executor, ' override-model ')
    expect(resolved!.modelId).toBe('override-model')
  })

  it('子代理或执行器缺失时返回 null', () => {
    const executor = createExecutor()
    expect(resolveSubAgentExecution(null, executor)).toBeNull()
    expect(resolveSubAgentExecution(createSubAgent(), null)).toBeNull()
    expect(resolveSubAgentExecution(null, null)).toBeNull()
  })
})

describe('resolveSubAgentExecutionWithFallback', () => {
  it('执行器回退到 agents[0]', () => {
    const agents = [createExecutor({ id: 'first' }), createExecutor({ id: 'second' })]
    const resolved = resolveSubAgentExecutionWithFallback(createSubAgent(), agents)
    expect(resolved!.agent.id).toBe('first')
  })

  it('子代理为空时返回 null（即便有执行器）', () => {
    expect(resolveSubAgentExecutionWithFallback(null, [createExecutor()])).toBeNull()
  })
})

describe('resolveSubAgentById', () => {
  it('按 id 查找子代理', () => {
    const list = [createSubAgent({ id: 'a' }), createSubAgent({ id: 'b' })]
    expect(resolveSubAgentById('b', list)?.id).toBe('b')
  })

  it('空 id 或未命中返回 null', () => {
    expect(resolveSubAgentById(null, [createSubAgent()])).toBeNull()
    expect(resolveSubAgentById('', [createSubAgent()])).toBeNull()
    expect(resolveSubAgentById('missing', [createSubAgent()])).toBeNull()
  })
})

describe('resolveFallbackAgent', () => {
  it('返回第一个 agent', () => {
    expect(resolveFallbackAgent([createExecutor({ id: 'a' })])?.id).toBe('a')
  })
  it('空数组返回 null', () => {
    expect(resolveFallbackAgent([])).toBeNull()
  })
})

describe('buildSubAgentSystemPrompt', () => {
  it('baseline + persona 组装为 systemPrompt（将经 _meta.systemPrompt 注入 ACP）', () => {
    const prompt = buildSubAgentSystemPrompt('你是架构子代理')
    expect(prompt).toContain('你当前以被分配子代理的身份工作')
    expect(prompt).toContain('你是架构子代理')
    // 两段以空行分隔
    expect(prompt).toMatch(/身份工作.*\n\n.*你是架构子代理/s)
  })

  it('附加内部补充片段', () => {
    const prompt = buildSubAgentSystemPrompt('persona', ['补充1', '补充2'])
    expect(prompt).toContain('补充1')
    expect(prompt).toContain('补充2')
  })

  it('空 persona 仍包含 baseline', () => {
    const prompt = buildSubAgentSystemPrompt(null)
    expect(prompt).toContain('你当前以被分配子代理的身份工作')
  })

  it('跳过空片段', () => {
    const prompt = buildSubAgentSystemPrompt('persona', ['', '  ', '有效'])
    expect(prompt).toContain('有效')
    // 空白片段不应产生多余空段
    expect(prompt.split('\n\n').filter(Boolean).length).toBeGreaterThanOrEqual(2)
  })
})

describe('buildSubAgentCatalogPrompt', () => {
  it('空列表返回占位文案', () => {
    expect(buildSubAgentCatalogPrompt([])).toBe('当前没有可用的子代理配置。')
  })

  it('列出子代理清单且不再包含"运行时"行', () => {
    const list = [createSubAgent({ id: 'sa-1', name: '开发', category: 'developer', tags: ['dev'], recommendedScenes: ['任务执行'] })]
    const prompt = buildSubAgentCatalogPrompt(list)
    expect(prompt).toContain('expertId: sa-1')
    expect(prompt).toContain('名称: 开发')
    expect(prompt).toContain('分类: developer')
    // 关键：子代理不再绑定执行器，catalog 不应出现运行时行
    expect(prompt).not.toContain('运行时')
  })
})
