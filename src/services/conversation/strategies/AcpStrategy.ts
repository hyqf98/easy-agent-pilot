/** 基于 ACP 协议的会话执行策略实现。 */
import { BaseAgentStrategy } from './BaseAgentStrategy'
import type { AgentConfig } from '@/stores/agent'
import { matchesAgentRuntimeProfile, type AgentRuntimeKey } from '../runtimeProfiles'

export class AcpStrategy extends BaseAgentStrategy {
  readonly name = 'ACP'
  protected readonly runtimeKey = 'claude-acp' as AgentRuntimeKey

  supports(agent: AgentConfig): boolean {
    if (agent.type !== 'acp') return false
    const allKeys: AgentRuntimeKey[] = ['claude-acp', 'codex-acp', 'opencode-acp', 'custom-acp']
    return allKeys.some(key => matchesAgentRuntimeProfile(agent, key))
  }
}
