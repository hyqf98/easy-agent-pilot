import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { syncSubAgentFiles, clearSubAgentFiles } from './syncService'
import { supportsNativeDelegation, filterDelegationCapableAgents } from './capabilityDetector'
import type { AgentConfig } from '@/stores/agent'
import type { SubAgent } from '@/stores/subAgent'

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>

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
    tools: ['Read', 'Edit'],
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

describe('capabilityDetector', () => {
  it('claude 与 opencode 支持原生子代理委派', () => {
    expect(supportsNativeDelegation('claude')).toBe(true)
    expect(supportsNativeDelegation('opencode')).toBe(true)
  })

  it('codex 与未知 provider 不支持委派（降级）', () => {
    expect(supportsNativeDelegation('codex')).toBe(false)
    expect(supportsNativeDelegation(undefined)).toBe(false)
    expect(supportsNativeDelegation('custom')).toBe(false)
  })

  it('filterDelegationCapableAgents 只保留 claude/opencode 执行器', () => {
    const agents = [
      createExecutor({ id: 'a', provider: 'claude' }),
      createExecutor({ id: 'b', provider: 'codex' }),
      createExecutor({ id: 'c', provider: 'opencode' }),
      createExecutor({ id: 'd', provider: 'custom' })
    ]
    const capable = filterDelegationCapableAgents(agents)
    expect(capable.map(a => a.id)).toEqual(['a', 'c'])
  })
})

describe('syncSubAgentFiles', () => {
  afterEach(() => {
    invokeMock.mockReset()
  })

  it('claude 执行器：调用 invoke 写盘并把启用子代理转换为文件输入', async () => {
    invokeMock.mockResolvedValue({ written: ['/proj/.claude/agents/ea-builtin-general.md'], cleared: [] })
    const executor = createExecutor({ provider: 'claude' })
    const subAgents = [
      createSubAgent({ builtinCode: 'builtin-general', name: '通用', tools: ['Read', 'Bash'] }),
      createSubAgent({ id: 'sub-2', builtinCode: undefined, name: '自定义', prompt: 'p', isEnabled: true })
    ]

    const written = await syncSubAgentFiles(executor, subAgents, '/proj')

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('sync_sub_agent_files', {
      input: {
        provider: 'claude',
        projectPath: '/proj',
        userHome: null,
        subAgents: [
          expect.objectContaining({ key: 'builtin-general', name: '通用', tools: ['Read', 'Bash'] }),
          expect.objectContaining({ key: 'sub-2', name: '自定义' })
        ]
      }
    })
    expect(written).toEqual(['/proj/.claude/agents/ea-builtin-general.md'])
  })

  it('opencode 执行器：同样写盘，provider 透传为 opencode', async () => {
    invokeMock.mockResolvedValue({ written: ['/p/.opencode/agents/ea-x.md'], cleared: [] })
    const executor = createExecutor({ provider: 'opencode' })

    await syncSubAgentFiles(executor, [createSubAgent()], '/p')

    expect(invokeMock).toHaveBeenCalledWith('sync_sub_agent_files', expect.objectContaining({
      input: expect.objectContaining({ provider: 'opencode' })
    }))
  })

  it('codex 执行器：不调用 invoke，直接返回空（降级）', async () => {
    const executor = createExecutor({ provider: 'codex' })
    const written = await syncSubAgentFiles(executor, [createSubAgent()], '/proj')
    expect(invokeMock).not.toHaveBeenCalled()
    expect(written).toEqual([])
  })

  it('禁用的子代理不会被写盘', async () => {
    invokeMock.mockResolvedValue({ written: [], cleared: [] })
    const executor = createExecutor({ provider: 'claude' })
    const disabled = createSubAgent({ isEnabled: false })

    await syncSubAgentFiles(executor, [disabled], '/proj')

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('自定义子代理用 id 作为文件名 key（无 builtinCode 时）', async () => {
    invokeMock.mockResolvedValue({ written: [], cleared: [] })
    const executor = createExecutor({ provider: 'claude' })
    const custom = createSubAgent({ id: 'custom-xyz', builtinCode: undefined })

    await syncSubAgentFiles(executor, [custom], '/proj')

    const call = invokeMock.mock.calls[0][1] as { input: { subAgents: Array<{ key: string }> } }
    expect(call.input.subAgents[0].key).toBe('custom-xyz')
  })

  it('projectPath 为空时传 null（由后端解析 userHome）', async () => {
    invokeMock.mockResolvedValue({ written: [], cleared: [] })
    await syncSubAgentFiles(createExecutor({ provider: 'claude' }), [createSubAgent()])
    const call = invokeMock.mock.calls[0][1] as { input: { projectPath: string | null } }
    expect(call.input.projectPath).toBeNull()
  })
})

describe('clearSubAgentFiles', () => {
  afterEach(() => {
    invokeMock.mockReset()
  })

  it('claude 执行器：调用 clear 命令清理标记文件', async () => {
    invokeMock.mockResolvedValue(['/p/.claude/agents/ea-x.md'])
    const cleared = await clearSubAgentFiles(createExecutor({ provider: 'claude' }), '/p')
    expect(invokeMock).toHaveBeenCalledWith('clear_sub_agent_files', {
      input: { provider: 'claude', projectPath: '/p', userHome: null }
    })
    expect(cleared).toEqual(['/p/.claude/agents/ea-x.md'])
  })

  it('codex 执行器：不调用清理命令', async () => {
    const cleared = await clearSubAgentFiles(createExecutor({ provider: 'codex' }), '/p')
    expect(invokeMock).not.toHaveBeenCalled()
    expect(cleared).toEqual([])
  })
})
