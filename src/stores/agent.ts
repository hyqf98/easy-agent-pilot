import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { useAgentConfigStore } from './agentConfig'
import { getErrorMessage } from '@/utils/api'
export type AgentType = 'acp'
export type AgentProvider = 'claude' | 'codex' | 'opencode' | 'custom'
export type AgentStatus = 'online' | 'offline' | 'error' | 'testing'

export interface AgentConfig {
  id: string
  name: string
  type: AgentType
  provider?: AgentProvider
  acpCommand?: string
  cliPath?: string
  apiKey?: string
  baseUrl?: string
  modelId?: string
  customModelEnabled?: boolean
  mode?: string
  model?: string
  status?: AgentStatus
  testMessage?: string
  testedAt?: string
  createdAt: string
  updatedAt: string
}

export function inferAgentProvider(
  agent?: Pick<AgentConfig, 'provider' | 'name' | 'cliPath' | 'acpCommand'> | null
): AgentProvider | undefined {
  if (!agent) {
    return undefined
  }

  if (agent.provider === 'claude' || agent.provider === 'codex' || agent.provider === 'opencode' || agent.provider === 'custom') {
    return agent.provider
  }

  const hint = `${agent.name || ''} ${agent.acpCommand || agent.cliPath || ''}`.toLowerCase()
  if (hint.includes('claude')) {
    return 'claude'
  }
  if (hint.includes('codex')) {
    return 'codex'
  }
  if (hint.includes('opencode')) {
    return 'opencode'
  }

  return undefined
}

export function normalizeCliCommand(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed
}

// 后端返回的原始数据结构（snake_case）
interface RawAgentData {
  id: string
  name: string
  type: string
  provider?: string
  cli_path?: string
  acp_command?: string
  api_key?: string
  base_url?: string
  model_id?: string
  custom_model_enabled?: boolean
  mode?: string
  model?: string
  status?: string
  test_message?: string
  tested_at?: string
  created_at: string
  updated_at: string
}

// 测试连接结果
interface TestConnectionResult {
  success: boolean
  message: string
}

function transformAgent(raw: RawAgentData): AgentConfig {
  const acpCommand = raw.acp_command || raw.cli_path
  return {
    id: raw.id,
    name: raw.name,
    type: 'acp',
    provider: raw.provider as AgentProvider | undefined,
    acpCommand,
    cliPath: raw.cli_path,
    apiKey: raw.api_key,
    baseUrl: raw.base_url,
    modelId: raw.model_id,
    customModelEnabled: raw.custom_model_enabled,
    mode: raw.mode,
    model: raw.model,
    status: (raw.status || 'offline') as AgentStatus,
    testMessage: raw.test_message,
    testedAt: raw.tested_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at
  }
}

export const useAgentStore = defineStore('agent', () => {
  // State
  const agents = ref<AgentConfig[]>([])
  const currentAgentId = ref<string | null>(null)
  const isLoading = ref(false)
  const testingAgentId = ref<string | null>(null)

  // Getters
  const currentAgent = computed(() =>
    agents.value.find(a => a.id === currentAgentId.value)
  )

  const agentsByType = computed(() => {
    return (type: AgentType) =>
      agents.value.filter(a => a.type === type)
  })

  const agentsByProvider = computed(() => {
    return (provider: AgentProvider) =>
      agents.value.filter(a => a.provider === provider)
  })

  // Actions
  async function loadAgents() {
    isLoading.value = true
    const notificationStore = useNotificationStore()
    try {
      const rawAgents = await invoke<RawAgentData[]>('list_agents')
      agents.value = rawAgents.map(transformAgent)
    } catch (error) {
      console.error('Failed to load agents:', error)
      agents.value = []
      notificationStore.networkError(
        '加载智能体失败',
        getErrorMessage(error),
        loadAgents
      )
    } finally {
      isLoading.value = false
    }
  }

  async function createAgent(agent: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
    const notificationStore = useNotificationStore()

    try {
      const rawAgent = await invoke<RawAgentData>('create_agent', {
        input: {
          name: agent.name,
          type: agent.type || 'acp',
          provider: agent.provider,
          cli_path: agent.cliPath,
          acp_command: agent.acpCommand,
          api_key: agent.apiKey,
          base_url: agent.baseUrl,
          model_id: agent.modelId,
          custom_model_enabled: agent.customModelEnabled,
          mode: agent.mode,
          model: agent.model
        }
      })
      const newAgent = transformAgent(rawAgent)
      agents.value.push(newAgent)
      return newAgent
    } catch (error) {
      console.error('Failed to create agent:', error)
      notificationStore.databaseError(
        '创建智能体失败',
        getErrorMessage(error),
        async () => { await createAgent(agent) }
      )
      throw error
    }
  }

  async function updateAgent(id: string, updates: Partial<AgentConfig>) {
    const notificationStore = useNotificationStore()
    const agentConfigStore = useAgentConfigStore()
    const existingAgent = agents.value.find(agent => agent.id === id)
    const nextProvider = updates.provider ?? existingAgent?.provider
    const providerChanged = Boolean(
      existingAgent && existingAgent.provider !== nextProvider
    )

    try {
      const rawAgent = await invoke<RawAgentData>('update_agent', {
        id,
        input: {
          name: updates.name,
          type: updates.type,
          provider: updates.provider,
          cli_path: updates.cliPath,
          acp_command: updates.acpCommand,
          api_key: updates.apiKey,
          base_url: updates.baseUrl,
          model_id: updates.modelId,
          custom_model_enabled: updates.customModelEnabled,
          mode: updates.mode,
          model: updates.model,
          status: updates.status
        }
      })
      const index = agents.value.findIndex(a => a.id === id)
      if (index !== -1) {
        agents.value[index] = transformAgent(rawAgent)
      }

      if (providerChanged) {
        agentConfigStore.clearConfigs(id)
      }
    } catch (error) {
      console.error('Failed to update agent:', error)
      notificationStore.databaseError(
        '更新智能体失败',
        getErrorMessage(error),
        () => updateAgent(id, updates)
      )
      throw error
    }
  }

  async function deleteAgent(id: string) {
    const notificationStore = useNotificationStore()

    try {
      await invoke('delete_agent', { id })
      const index = agents.value.findIndex(a => a.id === id)
      if (index !== -1) {
        agents.value.splice(index, 1)
      }
      if (currentAgentId.value === id) {
        currentAgentId.value = null
      }
    } catch (error) {
      console.error('Failed to delete agent:', error)
      notificationStore.databaseError(
        '删除智能体失败',
        getErrorMessage(error),
        () => deleteAgent(id)
      )
      throw error
    }
  }

  function setCurrentAgent(id: string | null) {
    currentAgentId.value = id
  }

  async function testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const agent = agents.value.find(a => a.id === id)
    if (!agent) {
      return { success: false, message: '智能体不存在' }
    }

    testingAgentId.value = id

    // 先更新前端状态为 testing
    const index = agents.value.findIndex(a => a.id === id)
    if (index !== -1) {
      agents.value[index] = { ...agents.value[index], status: 'testing' }
    }

    try {
      // 调用 Tauri 命令测试连接
      const result = await invoke<TestConnectionResult>('test_agent_connection', { id })

      // 更新前端状态
      if (index !== -1) {
        const rawAgent = await invoke<RawAgentData>('update_agent', {
          id,
          input: {
            status: result.success ? 'online' : 'error'
          }
        })
        agents.value[index] = transformAgent(rawAgent)
      }

      return result
    } catch (error) {
      // 更新状态为 error
      if (index !== -1) {
        agents.value[index] = { ...agents.value[index], status: 'error' }
      }
      return { success: false, message: String(error) }
    } finally {
      testingAgentId.value = null
    }
  }

  return {
    // State
    agents,
    currentAgentId,
    isLoading,
    testingAgentId,
    // Getters
    currentAgent,
    agentsByType,
    agentsByProvider,
    // Actions
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    setCurrentAgent,
    testConnection
  }
})
