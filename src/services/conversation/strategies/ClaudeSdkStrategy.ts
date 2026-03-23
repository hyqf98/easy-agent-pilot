import { BaseAgentStrategy } from './BaseAgentStrategy'

export class ClaudeSdkStrategy extends BaseAgentStrategy {
  readonly name = 'Claude SDK'
  protected readonly runtimeKey = 'claude-sdk' as const
}
