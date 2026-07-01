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
 * @deprecated ACP 后端 MessageRecorder 采用“一行一连续段”模型，
 * 同一 requestId 下允许存在多条 assistant text 段。旧版预创建空 text 占位时需要
 * 按 request 去重；现在该操作会破坏刷新后的历史顺序和内容完整性。
 * 保留导出仅兼容旧调用方，行为等同于原数组返回。
 */
export function dedupeRequestTextRows<T extends DedupeMessageLike>(items: T[]): T[] {
  return items
}
