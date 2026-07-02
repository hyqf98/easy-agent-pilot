import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import { getErrorMessage } from '@/utils/api'
import {
  buildAgentExecutionRequest,
  getAgentRuntimeProfile,
  matchesAgentRuntimeProfile,
  validateAgentRuntime,
  type AbortCommand,
  type AgentRuntimeKey
} from '../runtimeProfiles'
import { writeFrontendRuntimeLog } from '@/services/runtimeLog/client'
import { buildNonImageAttachmentPrompt } from '@/utils/attachmentMeta'
import type {
  AgentStrategy,
  BackendStreamEvent,
  ConversationContext,
  ExecutionRequest,
  StreamEvent
} from './types'

interface ExecutionEventState {
  sawMeaningfulOutput: boolean
  sawDone: boolean
  sawError: boolean
  lastEventAt: number
}

const QUIET_WAIT_AFTER_STREAM_EVENT_MS = 800
const QUIET_WAIT_WITH_OUTPUT_MS = 2000
const MAX_TERMINAL_EVENT_WAIT_MS = 10000

interface ActiveExecution {
  runId: symbol
  sessionId: string
  abortController: AbortController
  eventState: ExecutionEventState
  unlistenStream: UnlistenFn | null
}

function parseToolPayload(value?: string): Record<string, unknown> | undefined {
  if (!value) return undefined

  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  } catch {
    return { raw: value }
  }

  return undefined
}

export abstract class BaseAgentStrategy implements AgentStrategy {
  abstract readonly name: string
  protected abstract readonly runtimeKey: AgentRuntimeKey

  private readonly activeExecutions = new Map<string, ActiveExecution>()

  supports(agent: AgentConfig): boolean {
    return matchesAgentRuntimeProfile(agent, this.runtimeKey)
  }

  protected validateContext(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): boolean {
    const error = validateAgentRuntime(context.agent, this.runtimeKey)
    if (error) {
      onEvent({
        type: 'error',
        error
      })
      return false
    }

    return true
  }

  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    if (!this.validateContext(context, onEvent)) {
      return
    }

    const execution = this.createExecution(context.sessionId)

    try {
      const registeredAt = Date.now()

      execution.unlistenStream = await listen<BackendStreamEvent>(
        this.getEventName(context.sessionId),
        (event) => {
          const raw = event.payload
          if (!raw) return

          // 内联归一化：reasoning→thinking，parse toolInput，忽略无关事件
          const type = raw.type === 'reasoning' ? 'thinking'
            : raw.type === 'reasoning_start' ? 'thinking_start'
            : raw.type
          if (type === 'message_start' || type === 'session_started') return

          const streamEvent: StreamEvent = {
            ...raw,
            type: type as StreamEvent['type'],
            toolInput: raw.toolInput ? parseToolPayload(raw.toolInput) : undefined,
          }

          if (type === 'context_window') {
            streamEvent.contextWindowUsed = raw.inputTokens
            streamEvent.contextWindowSize = raw.outputTokens
          }

          if (
            streamEvent.type === 'done'
            && !execution.eventState.sawMeaningfulOutput
            && Date.now() - registeredAt < 200
          ) {
            return
          }

          this.recordEventState(execution.eventState, streamEvent)
          onEvent(streamEvent)
        }
      )

      const request = this.buildRequest(context)

      console.info('[AI Execute] start', {
        provider: request.provider,
        mode: request.executionMode,
        responseMode: request.responseMode,
        outputFormat: 'acp',
        sessionId: context.sessionId
      })

      await invoke('execute_agent', { request })

      await this.waitForTerminalEvent(execution.eventState)

      console.info('[AI Execute] done', {
        provider: request.provider,
        mode: request.executionMode,
        sessionId: context.sessionId
      })
    } catch (error) {
      if (execution.abortController.signal.aborted) {
        onEvent({ type: 'done' })
        return
      }

      const eventState = this.getSafeEventState(execution.eventState)

      const errorMessage = getErrorMessage(error, '智能体执行失败')
      console.error('[AI Execute] failed', {
        provider: this.name,
        sessionId: context.sessionId,
        error: errorMessage
      })
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-frontend',
        `[AI Execute] failed | provider=${this.name} | sessionId=${context.sessionId} | error=${errorMessage}`,
        error
      )

      if (eventState.sawDone || eventState.sawError) {
        return
      }

      onEvent({
        type: 'error',
        error: errorMessage
      })
    } finally {
      this.cleanup(context.sessionId, execution.runId)
    }
  }

  abort(sessionId?: string): void {
    if (sessionId) {
      this.abortExecution(sessionId)
      return
    }

    for (const currentSessionId of this.activeExecutions.keys()) {
      this.abortExecution(currentSessionId)
    }
  }

  protected getEventName(sessionId: string): string {
    return getAgentRuntimeProfile(this.runtimeKey).eventName(sessionId)
  }

  protected getAbortCommand(): AbortCommand {
    return getAgentRuntimeProfile(this.runtimeKey).abortCommand
  }

  protected buildRequest(context: ConversationContext): ExecutionRequest {
    return buildAgentExecutionRequest({
      sessionId: context.sessionId,
      requestId: context.requestId,
      agent: context.agent,
      messages: this.toMessageInputs(context.messages),
      workingDirectory: context.workingDirectory,
      mcpServers: context.mcpServers,
      tools: context.tools,
      executionMode: context.executionMode,
      responseMode: context.responseMode,
      resumeSessionId: context.resumeSessionId,
      reasoningEffort: context.reasoningEffort,
      modelId: context.modelId,
      internalToolsEnabled: context.internalToolsEnabled,
      repoId: context.repoId
    })
  }

  protected toMessageInputs(messages: ConversationContext['messages']): ExecutionRequest['messages'] {
    return messages
      .filter(message => message.messageType !== 'compression')
      .map(message => {
        const nonImageAttachmentPrompt = buildNonImageAttachmentPrompt(message.attachments ?? [])
        const normalizedContent = [
          (message.content ?? '').trim(),
          nonImageAttachmentPrompt
        ].filter(Boolean).join('\n\n')

        return {
          role: message.role as 'system' | 'user' | 'assistant',
          content: normalizedContent,
          attachments: message.attachments
        }
      })
  }

  private createExecution(sessionId: string): ActiveExecution {
    const execution: ActiveExecution = {
      runId: Symbol(sessionId),
      sessionId,
      abortController: new AbortController(),
      eventState: {
        sawMeaningfulOutput: false,
        sawDone: false,
        sawError: false,
        lastEventAt: Date.now()
      },
      unlistenStream: null
    }

    this.activeExecutions.set(sessionId, execution)
    return execution
  }

  private getSafeEventState(state: ExecutionEventState): ExecutionEventState {
    return { ...state }
  }

  private recordEventState(state: ExecutionEventState, event: StreamEvent): void {
    switch (event.type) {
      case 'content':
      case 'thinking':
      case 'system':
      case 'tool_use':
      case 'tool_input_delta':
      case 'tool_result':
      case 'file_edit':
        state.sawMeaningfulOutput = true
        state.lastEventAt = Date.now()
        break
      case 'error':
        state.sawError = true
        state.lastEventAt = Date.now()
        break
      case 'done':
        state.sawDone = true
        state.lastEventAt = Date.now()
        break
      default:
        state.lastEventAt = Date.now()
        break
    }
  }

  private async waitForTerminalEvent(state: ExecutionEventState): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < MAX_TERMINAL_EVENT_WAIT_MS) {
      if (state.sawDone || state.sawError) {
        break
      }

      const quietWait = state.sawMeaningfulOutput
        ? QUIET_WAIT_WITH_OUTPUT_MS
        : QUIET_WAIT_AFTER_STREAM_EVENT_MS
      if (Date.now() - state.lastEventAt >= quietWait) {
        break
      }

      await new Promise(resolve => setTimeout(resolve, 16))
    }
  }

  private abortExecution(sessionId: string): void {
    const execution = this.activeExecutions.get(sessionId)
    if (!execution) {
      return
    }

    execution.abortController.abort()
    execution.unlistenStream?.()
    execution.unlistenStream = null

    invoke(this.getAbortCommand(), { sessionId }).catch((error) => {
      console.warn('[AI Execute] abort failed', error)
    })
  }

  private cleanup(sessionId: string, runId: symbol): void {
    const execution = this.activeExecutions.get(sessionId)
    if (!execution || execution.runId !== runId) {
      return
    }

    execution.unlistenStream?.()
    this.activeExecutions.delete(sessionId)
  }
}
