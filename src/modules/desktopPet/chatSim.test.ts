import { describe, expect, it } from 'vitest'

import { chunkMessage, pickCannedMessage, CANNED_MESSAGES } from './chatSim'

// 纯函数测试：无 DOM/Pixi/Tauri 依赖，覆盖 SSE 模拟的切分与随机取句。

describe('chunkMessage', () => {
  it('returns empty array for empty string', () => {
    expect(chunkMessage('')).toEqual([])
  })

  it('splits ASCII text by the given chunk size', () => {
    expect(chunkMessage('hello', 2)).toEqual(['he', 'll', 'o'])
  })

  it('splits CJK text by codepoints (not UTF-16 halves)', () => {
    const chunks = chunkMessage('你好世界', 2)
    expect(chunks).toEqual(['你好', '世界'])
    // 关键：每个 chunk 是完整汉字，而非拆成代理对。
    expect(chunks[0]).toHaveLength(2)
  })

  it('handles surrogate-pair emoji as single codepoints', () => {
    const chunks = chunkMessage('🐶🐱🐰', 1)
    expect(chunks).toEqual(['🐶', '🐱', '🐰'])
  })

  it('reconstructs the original text when joined', () => {
    const text = '今天也要元气满满哦！'
    expect(chunkMessage(text, 3).join('')).toBe(text)
  })

  it('throws on invalid chunk size', () => {
    expect(() => chunkMessage('abc', 0)).toThrow()
    expect(() => chunkMessage('abc', -1)).toThrow()
  })
})

describe('pickCannedMessage', () => {
  it('returns a message from the pool', () => {
    const msg = pickCannedMessage(() => 0.5)
    expect(CANNED_MESSAGES).toContain(msg)
  })

  it('respects the injected rng (deterministic)', () => {
    const first = pickCannedMessage(() => 0)
    expect(first).toBe(CANNED_MESSAGES[0])
  })

  it('wraps with modulo so index never out of range', () => {
    const msg = pickCannedMessage(() => 0.9999)
    expect(CANNED_MESSAGES).toContain(msg)
  })
})
