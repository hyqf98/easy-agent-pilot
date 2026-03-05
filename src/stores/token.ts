import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useMessageStore } from './message'
import { useAgentConfigStore } from './agentConfig'
import { useAgentStore } from './agent'
import { useSessionStore } from './session'

// 默认上下文窗口大小 (128K)
const DEFAULT_CONTEXT_WINDOW = 128000

// Token 使用级别
export type TokenLevel = 'safe' | 'warning' | 'danger' | 'critical'

// Token 使用情况
export interface TokenUsage {
  used: number          // 已使用 token
  limit: number         // 模型上下文窗口
  percentage: number    // 使用百分比 (0-100)
  level: TokenLevel     // 使用级别
}

// 压缩策略
export type CompressionStrategy = 'simple' | 'smart' | 'summary'

// 压缩选项
export interface CompressionOptions {
  strategy: CompressionStrategy
  keepRecentCount: number  // 保留最近 N 条消息
}

// 会话 token 缓存
interface SessionTokenCache {
  sessionId: string
  totalTokens: number
  lastUpdated: number
}

// 根据使用百分比获取级别
function getLevel(percentage: number): TokenLevel {
  if (percentage >= 95) return 'critical'
  if (percentage >= 80) return 'danger'
  if (percentage >= 60) return 'warning'
  return 'safe'
}

// 格式化 token 数量为可读字符串
export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}

export const useTokenStore = defineStore('token', () => {
  // State
  const sessionTokenCaches = ref<Map<string, SessionTokenCache>>(new Map())

  // Getters

  /**
   * 获取会话的 token 使用情况
   */
  const getTokenUsage = computed(() => {
    return (sessionId: string): TokenUsage => {
      const messageStore = useMessageStore()
      const agentConfigStore = useAgentConfigStore()
      const agentStore = useAgentStore()
      const sessionStore = useSessionStore()

      // 获取会话信息
      const session = sessionStore.sessions.find(s => s.id === sessionId)
      if (!session) {
        return { used: 0, limit: DEFAULT_CONTEXT_WINDOW, percentage: 0, level: 'safe' }
      }

      // 获取会话的智能体
      const agent = session.agentId
        ? agentStore.agents.find(a => a.id === session.agentId)
        : null

      // 获取智能体的模型配置
      let contextWindow = DEFAULT_CONTEXT_WINDOW
      if (agent) {
        const modelConfigs = agentConfigStore.getModelsConfigs(agent.id)
        const defaultModel = modelConfigs.find(m => m.isDefault && m.enabled)
        if (defaultModel?.contextWindow) {
          contextWindow = defaultModel.contextWindow
        }
      }

      // 计算已使用的 token
      const messages = messageStore.messagesBySession(sessionId)
      let usedTokens = 0

      for (const message of messages) {
        if (message.tokens) {
          usedTokens += message.tokens
        } else {
          // 如果消息没有 token 信息，使用简单估算（每4个字符约等于1个token）
          usedTokens += Math.ceil(message.content.length / 4)
        }
      }

      const percentage = Math.min(100, (usedTokens / contextWindow) * 100)
      const level = getLevel(percentage)

      return {
        used: usedTokens,
        limit: contextWindow,
        percentage,
        level
      }
    }
  })

  /**
   * 检查会话是否需要压缩
   */
  const needsCompression = computed(() => {
    return (sessionId: string): boolean => {
      const usage = getTokenUsage.value(sessionId)
      return usage.percentage >= 50
    }
  })

  // Actions

  /**
   * 更新会话的 token 缓存
   */
  function updateSessionTokenCache(sessionId: string) {
    const messageStore = useMessageStore()
    const messages = messageStore.messagesBySession(sessionId)

    let totalTokens = 0
    for (const message of messages) {
      if (message.tokens) {
        totalTokens += message.tokens
      } else {
        totalTokens += Math.ceil(message.content.length / 4)
      }
    }

    sessionTokenCaches.value.set(sessionId, {
      sessionId,
      totalTokens,
      lastUpdated: Date.now()
    })
  }

  /**
   * 清除会话的 token 缓存
   */
  function clearSessionTokenCache(sessionId: string) {
    sessionTokenCaches.value.delete(sessionId)
  }

  /**
   * 清除所有 token 缓存
   */
  function clearAllTokenCaches() {
    sessionTokenCaches.value.clear()
  }

  return {
    // State
    sessionTokenCaches,
    // Getters
    getTokenUsage,
    needsCompression,
    // Actions
    updateSessionTokenCache,
    clearSessionTokenCache,
    clearAllTokenCaches,
    // Utils
    formatTokenCount
  }
})
