import { invoke } from '@tauri-apps/api/core'
import { inferAgentProvider, type AgentConfig } from '@/stores/agent'
import type { RecordAgentCliUsageInput } from '@/types/agentCliUsage'
import type { PlanSplitLogRecord } from '@/types/plan'

interface UsageSnapshot {
  modelId?: string
  inputTokens?: number
  outputTokens?: number
}

function buildUsagePayload(
  agent: Pick<AgentConfig, 'id' | 'name' | 'provider'>,
  input: Omit<RecordAgentCliUsageInput, 'provider' | 'agentId' | 'agentNameSnapshot'>
): RecordAgentCliUsageInput | null {
  const provider = inferAgentProvider(agent)
  if (provider !== 'claude' && provider !== 'codex') {
    return null
  }

  return {
    ...input,
    provider,
    agentId: agent.id,
    agentNameSnapshot: agent.name
  }
}

export function findLatestUsageSnapshot(
  logs: Pick<PlanSplitLogRecord, 'type' | 'metadata'>[]
): UsageSnapshot {
  const usageState: UsageSnapshot = {}

  for (const log of logs) {
    if (log.type !== 'usage' && log.type !== 'message_start') {
      continue
    }

    if (!log.metadata) {
      continue
    }

    try {
      const metadata = JSON.parse(log.metadata) as {
        model?: unknown
        inputTokens?: unknown
        outputTokens?: unknown
      }

      if (typeof metadata.model === 'string' && metadata.model.trim()) {
        usageState.modelId = metadata.model.trim()
      }
      if (typeof metadata.inputTokens === 'number') {
        usageState.inputTokens = metadata.inputTokens
      }
      if (typeof metadata.outputTokens === 'number') {
        usageState.outputTokens = metadata.outputTokens
      }
    } catch {
      continue
    }
  }

  return usageState
}

export async function recordAgentCliUsage(
  agent: Pick<AgentConfig, 'id' | 'name' | 'provider'>,
  input: Omit<RecordAgentCliUsageInput, 'provider' | 'agentId' | 'agentNameSnapshot'>
): Promise<void> {
  const payload = buildUsagePayload(agent, input)
  if (!payload) {
    return
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await invoke('record_agent_cli_usage', { input: payload })
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const shouldRetry = /foreign key constraint failed/i.test(message) && attempt < 2
      if (shouldRetry) {
        await new Promise(resolve => window.setTimeout(resolve, 600 * (attempt + 1)))
        continue
      }

      console.warn('[agentCliUsageRecorder] Failed to record CLI usage:', error)
      return
    }
  }
}

export function recordAgentCliUsageInBackground(
  agent: Pick<AgentConfig, 'id' | 'name' | 'provider'>,
  input: Omit<RecordAgentCliUsageInput, 'provider' | 'agentId' | 'agentNameSnapshot'>
): void {
  void recordAgentCliUsage(agent, input)
}
