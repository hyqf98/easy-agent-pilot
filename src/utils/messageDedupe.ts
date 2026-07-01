/**
 * 去重函数依赖的最小消息结构（避免与 store 形成运行时循环依赖，仅用结构化类型）。
 */
export interface DedupeMessageLike {
  id: string
  sessionId: string
  requestId?: string
  role: string
  messageType: string
  content?: string
}

/**
 * 按消息 id 去重（后出现的覆盖先出现的）。
 */
export function dedupeMessagesById<T extends DedupeMessageLike>(items: T[]): T[] {
  const map = new Map<string, T>()

  for (const message of items) {
    map.set(message.id, message)
  }

  return Array.from(map.values())
}

/**
 * 同一回合（requestId）内的 assistant 文本行去重。
 *
 * 背景：前端会话执行器会创建一条 streaming assistant text 行用于实时渲染，
 * 后端 MessageRecorder 也会把文本增量落库为另一条 text 行。流式期间前端只渲染本地行，
 * 但刷新 loadMessages 后两条都会被返回，导致同一回复文本重复显示。
 *
 * 策略：对每个 (sessionId, requestId) 下多条 `role==='assistant' && messageType==='text'` 行，
 * 仅保留 content 长度最长（最完整）的一条，丢弃其余。空内容行同样按长度比较被丢弃。
 * thinking / tool_use / usage 等其它类型不受影响（后端为唯一写入方，不会重复）。
 */
export function dedupeRequestTextRows<T extends DedupeMessageLike>(items: T[]): T[] {
  const textGroups = new Map<string, T[]>()
  const result: T[] = []

  for (const message of items) {
    const isAssistantText = message.role === 'assistant'
      && message.messageType === 'text'
      && typeof message.requestId === 'string'
      && message.requestId.length > 0
    if (!isAssistantText) {
      result.push(message)
      continue
    }

    const key = `${message.sessionId}::${message.requestId}`
    const group = textGroups.get(key)
    if (group) {
      group.push(message)
    } else {
      textGroups.set(key, [message])
    }
  }

  for (const group of textGroups.values()) {
    if (group.length <= 1) {
      result.push(...group)
      continue
    }
    // 保留 content 最长的一条；长度相同则保留最后一条（更新更晚）
    let keeper = group[0]
    for (let i = 1; i < group.length; i += 1) {
      const candidate = group[i]
      const candidateLen = candidate.content?.length ?? 0
      const keeperLen = keeper.content?.length ?? 0
      if (candidateLen >= keeperLen) {
        keeper = candidate
      }
    }
    result.push(keeper)
  }

  return result
}
