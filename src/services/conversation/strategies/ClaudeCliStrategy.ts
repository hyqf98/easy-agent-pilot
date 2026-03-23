import { BaseAgentStrategy } from './BaseAgentStrategy'

export class ClaudeCliStrategy extends BaseAgentStrategy {
  readonly name = 'Claude CLI'
  protected readonly runtimeKey = 'claude-cli' as const
}
