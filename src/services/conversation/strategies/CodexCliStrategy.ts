import { BaseAgentStrategy } from './BaseAgentStrategy'

export class CodexCliStrategy extends BaseAgentStrategy {
  readonly name = 'Codex CLI'
  protected readonly runtimeKey = 'codex-cli' as const
}
