import { invoke } from '@tauri-apps/api/core'
import { getErrorMessage } from '@/utils/api'

function formatRuntimeLogDetails(details?: unknown): string {
  if (details === undefined) {
    return ''
  }

  if (details instanceof Error) {
    return details.stack || details.message
  }

  if (typeof details === 'string') {
    return details
  }

  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}

/**
 * 向后端运行时日志补写前端已捕获的异常，保证跨端链路问题可追踪。
 */
export async function writeFrontendRuntimeLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  target: string,
  message: string,
  details?: unknown
): Promise<void> {
  const detailText = formatRuntimeLogDetails(details)
  const finalMessage = detailText ? `${message}\n${detailText}` : message

  try {
    await invoke('write_runtime_log_command', {
      level,
      target,
      message: finalMessage
    })
  } catch (error) {
    console.warn('[runtimeLog] Failed to write frontend runtime log:', getErrorMessage(error))
  }
}
