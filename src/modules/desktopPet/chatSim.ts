// 桌面宠物对话模拟工具（纯函数）。
//
// 在接入 ACP 真实对话前，用于模拟 SSE 流式输出：把一段完整文案切成小 token，
// 让视图层按节奏逐个 appendChatToken，实现打字机效果。纯逻辑、无副作用，便于单测。

import type { RandomSource } from './engine/types'

/**
 * 把一段文本切成若干"token"，模拟流式增量。
 *
 * 以码点（支持中文）按 maxCharsPerChunk 切分；空串返回空数组。最后一个 chunk 可能短于上限。
 */
export function chunkMessage(text: string, maxCharsPerChunk = 2): string[] {
  if (maxCharsPerChunk < 1) {
    throw new Error('maxCharsPerChunk must be >= 1')
  }
  if (text.length === 0) return []

  // Array.from 正确处理 Unicode 码点（emoji / 扩展汉字）。
  const codepoints = Array.from(text)
  const chunks: string[] = []

  for (let i = 0; i < codepoints.length; i += maxCharsPerChunk) {
    chunks.push(codepoints.slice(i, i + maxCharsPerChunk).join(''))
  }

  return chunks
}

/** 友好中文短句池 —— 模拟宠物"想说的话"。后续接入 ACP 后不再使用。 */
export const CANNED_MESSAGES: readonly string[] = [
  '嗨！很高兴见到你～',
  '今天也要元气满满哦！',
  '接下来我会接入 ACP，就能真正陪你聊天啦～',
  '哼哼，偷偷摸鱼被你发现了。',
  '需要我帮你跑一个任务吗？',
  '喝杯奶茶歇一会儿吧～'
]

/**
 * 从固定短句池随机取一条（用注入的 rng 保证可测）。
 */
export function pickCannedMessage(rng: RandomSource = Math.random): string {
  const index = Math.floor(rng() * CANNED_MESSAGES.length) % CANNED_MESSAGES.length
  return CANNED_MESSAGES[index]
}
