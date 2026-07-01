/**
 * 流式文本拼接。
 *
 * 与后端 MessageRecorder 的 SQL 纯追加（content = COALESCE(content,'') || ?1）保持一致。
 *
 * 设计依据：ACP 协议（claude / codex / opencode）的 AgentMessageChunk 均为**增量 delta**，
 * 每个 chunk 只携带一小段文本片段，前端需按到达顺序纯追加还原完整文本。
 * 详见后端诊断测试 `src-tauri/tests/acp_opencode_streaming.rs`——opencode 同样推送 delta。
 *
 * 历史背景：此前对 opencode 启用过「快照去重」（endsWith/includes/重叠检测），
 * 但 opencode 实际发送增量 delta，启发式判断会对含 markdown 代码块/重复子串的文本
 * 产生误判（丢弃或错位），导致实时渲染错乱、刷新后恢复正常的 bug。
 * 若将来遇到真正下发全量快照的 runtime，应在后端 acp.rs 中归一化为 delta 再 emit，
 * 而非在前端做不可靠的启发式去重。
 *
 * @param current 已累积的文本
 * @param incoming 本次到达的增量片段
 * @returns 拼接后的完整文本
 */
export function mergeStreamingText(current: string, incoming: string): string {
  if (!incoming) {
    return current
  }

  return current + incoming
}
