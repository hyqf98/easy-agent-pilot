/** ACP 工具权限询问（待决策请求）的 Pinia store。 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { PermissionOption } from '@/services/conversation/strategies/types'

/**
 * 一条待用户决策的 ACP 工具权限询问。
 *
 * 当 `acpPermissionMode = ask` 且 agent 发起权限请求时，后端会挂起等待；
 * 前端通过该状态驱动权限询问弹窗，用户选择后调用 `respond_permission` 回传决策。
 */
export interface PendingPermissionRequest {
  sessionId: string
  requestId: string
  /** 工具名称（如 read / write / bash） */
  toolName: string
  /** 工具输入（参数摘要，用于展示） */
  toolInput?: Record<string, unknown>
  /** 可选项（允许本次 / 允许全部 / 拒绝 等，按 ACP 返回的 options 渲染） */
  options: PermissionOption[]
}

/**
 * 待处理权限询问注册表（Pinia）。
 *
 * 同一会话同一请求至多一条；后端在 ask 模式下通过 permission_request 事件
 * 写入，用户决策后清空。会话中止 / 超时由后端兜底，前端在收到 done 后也会清理。
 */
export const usePermissionStore = defineStore('permission', () => {
  /** 当前待处理权限询问（按 sessionId 索引，便于多会话分屏场景） */
  const pending = ref<Record<string, PendingPermissionRequest>>({})

  function setPending(request: PendingPermissionRequest): void {
    pending.value[request.sessionId] = request
  }

  function clearPending(sessionId: string): void {
    delete pending.value[sessionId]
  }

  /** 获取指定会话的待处理权限询问 */
  function getPending(sessionId: string): PendingPermissionRequest | undefined {
    return pending.value[sessionId]
  }

  /** 回传用户决策到后端，并清空对应会话的待处理询问 */
  async function respond(
    sessionId: string,
    requestId: string,
    optionId: string
  ): Promise<void> {
    try {
      await invoke('respond_permission', { sessionId, requestId, optionId })
    } finally {
      clearPending(sessionId)
    }
  }

  return { pending, setPending, clearPending, getPending, respond }
})
