/** ACP session/list 返回的单条会话信息 */
export interface AcpSessionInfo {
  sessionId: string
  cwd: string
  title: string | null
  updatedAt: string | null
  messageCount: number | null
}

/** session/list 的完整结果 */
export interface AcpSessionListResult {
  sessions: AcpSessionInfo[]
  nextCursor: string | null
  projectPaths: string[]
}

/** session/load 回放的单个事件 */
export interface AcpReplayedEvent {
  eventType: string
  content: string | null
  role: string | null
  toolCallId: string | null
  toolName: string | null
  toolInput: string | null
  toolResult: string | null
  inputTokens: number | null
  outputTokens: number | null
}

/** session/load 回放的完整结果 */
export interface AcpSessionHistoryResult {
  sessionId: string
  events: AcpReplayedEvent[]
}

/** Agent 的会话能力探测结果 */
export interface AcpCapabilities {
  supportsList: boolean
  supportsLoad: boolean
  supportsDelete: boolean
  supportsClose: boolean
  supportsResume: boolean
}