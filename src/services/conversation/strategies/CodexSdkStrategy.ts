import { BaseAgentStrategy } from './BaseAgentStrategy'

export class CodexSdkStrategy extends BaseAgentStrategy {
  readonly name = 'Codex SDK'
  protected readonly runtimeKey = 'codex-sdk' as const
}
