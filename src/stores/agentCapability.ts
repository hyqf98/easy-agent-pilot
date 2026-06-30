import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AvailableCommandInfo } from '@/services/conversation/strategies/types'
import logger from '@/utils/logger'

/**
 * 解析后端下发的 `available_commands` JSON（AvailableCommandInfo 数组）。
 *
 * 后端在 ACP `AvailableCommandsUpdate` 分支把命令序列化为
 * `[{ name, description, hint }]` 的 JSON 字符串，复用流事件 `content` 字段下发。
 */
export function parseAvailableCommandsJson(commandsJson: string): AvailableCommandInfo[] {
  try {
    const raw = JSON.parse(commandsJson) as unknown
    if (!Array.isArray(raw)) {
      return []
    }
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        name: String(item.name ?? ''),
        description: String(item.description ?? ''),
        hint: item.hint === undefined || item.hint === null ? undefined : String(item.hint)
      }))
      .filter(cmd => cmd.name.length > 0)
  } catch (err) {
    logger.warn('[agentCapability] parse available commands json failed', err)
    return []
  }
}

/**
 * 各会话 ACP Agent 运行时能力（当前仅 Agent 下发的可斜杠命令）。
 *
 * 用于在 `/` 斜杠命令下拉中合并「Agent 命令」分组：这些命令由 Agent 自身
 * 实现，不注册前端 handler，选中后以 `/name args` 形式作为 prompt 发给 Agent。
 */
export const useAgentCapabilityStore = defineStore('agentCapability', () => {
  /** 各会话 Agent 下发的可斜杠命令（按 sessionId 取） */
  const commandsBySession = ref<Map<string, AvailableCommandInfo[]>>(new Map())

  function getCommands(sessionId: string): AvailableCommandInfo[] {
    return commandsBySession.value.get(sessionId) ?? []
  }

  /** 实时接入 ACP `available_commands` 事件，整体替换该会话的命令列表 */
  function setAvailableCommands(sessionId: string, commandsJson: string): void {
    const commands = parseAvailableCommandsJson(commandsJson)
    commandsBySession.value.set(sessionId, commands)
    commandsBySession.value = new Map(commandsBySession.value)
  }

  function clearSession(sessionId: string): void {
    commandsBySession.value.delete(sessionId)
    commandsBySession.value = new Map(commandsBySession.value)
  }

  return {
    commandsBySession,
    getCommands,
    setAvailableCommands,
    clearSession,
  }
})
