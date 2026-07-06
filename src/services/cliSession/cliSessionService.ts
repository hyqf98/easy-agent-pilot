/** ACP CLI 会话列表、历史详情与能力探测的 IPC 封装。 */
import { invoke } from '@tauri-apps/api/core'
import type {
  AcpSessionListResult,
  AcpSessionHistoryResult,
  AcpCapabilities
} from '@/types/cliSessionManager'

/** 获取 ACP 会话列表 */
export async function listSessions(agentCmd: string, cwd?: string): Promise<AcpSessionListResult> {
  return invoke<AcpSessionListResult>('list_acp_sessions', {
    agentCmd,
    cwd: cwd ?? null
  })
}

/** 读取会话历史详情 */
export async function readSessionDetail(
  agentCmd: string,
  sessionId: string,
  cwd: string
): Promise<AcpSessionHistoryResult> {
  return invoke<AcpSessionHistoryResult>('read_acp_session_history', {
    agentCmd,
    sessionId,
    cwd
  })
}

/** 删除指定会话 */
export async function deleteSession(
  agentCmd: string,
  cliName: string,
  sessionId: string,
  cwd: string
): Promise<void> {
  return invoke('delete_session_by_id', {
    agentCmd,
    cliName,
    sessionId,
    cwd
  })
}

/** 探测 Agent 的会话能力 */
export async function probeCapabilities(agentCmd: string): Promise<AcpCapabilities> {
  return invoke<AcpCapabilities>('probe_acp_session_capabilities', {
    agentCmd
  })
}