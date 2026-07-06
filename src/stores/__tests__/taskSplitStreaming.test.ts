import { describe, expect, it, vi } from 'vitest'

// 隔断 settings/i18n 的 localStorage 依赖（taskSplit 模块导入链会触发）
vi.mock('@/stores/settings', () => ({
  useSettingsStore: vi.fn(() => ({
    cliFailureMaxRetries: 5,
    defaultModelId: null,
    ensureLoaded: vi.fn(),
    isLoaded: true,
    modelConfigs: []
  }))
}))

vi.mock('@/i18n', () => ({ default: { t: (k: string) => k, locale: 'zh-CN' } }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {}))
}))

import {
  clampLogContent,
  isAnomalousContent,
  PLAN_SPLIT_STREAMING_LIMITS as L
} from '../taskSplit'

describe('isAnomalousContent（层 4 异常输出检测）', () => {
  it('空字符串/空内容视为正常（不累计）', () => {
    expect(isAnomalousContent('')).toBe(false)
  })

  it('正常任务拆分文本（有换行、长度适中）视为正常', () => {
    const normal = '## 任务1：项目初始化\n创建项目目录结构\n- src/\n- package.json'
    expect(isAnomalousContent(normal)).toBe(false)
  })

  it('MCP 工具定义 JSON 数组开头视为异常', () => {
    const toolJson = '[{"description":"[Tauri Apps Only] Find and fix JavaScript errors"}]'
    expect(isAnomalousContent(toolJson)).toBe(true)
  })

  it('工具定义 JSON 对象开头（description）视为异常', () => {
    const toolJson = '{"description":"Read the contents of a file"}'
    expect(isAnomalousContent(toolJson)).toBe(true)
  })

  it('inputSchema 开头视为异常', () => {
    const schema = '{"inputSchema":{"type":"object","properties":{}}}'
    expect(isAnomalousContent(schema)).toBe(true)
  })

  it('超长无换行文本（>20000 字符）视为异常', () => {
    const longNoNewline = 'a'.repeat(L.ANOMALOUS_LONG_CONTENT_CHARS + 1)
    expect(isAnomalousContent(longNoNewline)).toBe(true)
  })

  it('超长但有换行的文本视为正常（结构化输出）', () => {
    const longWithNewline = 'a'.repeat(L.ANOMALOUS_LONG_CONTENT_CHARS + 100) + '\n第二行'
    expect(isAnomalousContent(longWithNewline)).toBe(false)
  })

  it('普通短 JSON（非工具定义）不误判', () => {
    const normalJson = '{"key":"value","count":3}'
    expect(isAnomalousContent(normalJson)).toBe(false)
  })

  it('恰好达阈值不算异常（边界）', () => {
    // 长度 === ANOMALOUS_LONG_CONTENT_CHARS 且无换行，不 > 阈值，应正常
    const atThreshold = 'a'.repeat(L.ANOMALOUS_LONG_CONTENT_CHARS)
    expect(isAnomalousContent(atThreshold)).toBe(false)
  })
})

describe('clampLogContent（层 2 单条截断）', () => {
  it('短内容不截断', () => {
    expect(clampLogContent('短内容')).toBe('短内容')
  })

  it('恰好达上限不截断（边界）', () => {
    const atMax = 'x'.repeat(L.MAX_LOG_CONTENT_CHARS)
    expect(clampLogContent(atMax)).toBe(atMax)
    expect(clampLogContent(atMax).length).toBe(L.MAX_LOG_CONTENT_CHARS)
  })

  it('超上限截断并追加提示', () => {
    const overMax = 'y'.repeat(L.MAX_LOG_CONTENT_CHARS + 500)
    const clamped = clampLogContent(overMax)
    expect(clamped.length).toBeLessThan(overMax.length)
    expect(clamped.endsWith('…[内容过长已截断]')).toBe(true)
    // 截断后总长度 = MAX + 提示文案（含换行）
    expect(clamped.length).toBe(L.MAX_LOG_CONTENT_CHARS + '\n…[内容过长已截断]'.length)
  })

  it('多字节字符（中文）截断不丢提示', () => {
    const chinese = '任务'.repeat(L.MAX_LOG_CONTENT_CHARS) // 远超上限
    const clamped = clampLogContent(chinese)
    expect(clamped.endsWith('…[内容过长已截断]')).toBe(true)
  })
})

describe('PLAN_SPLIT_STREAMING_LIMITS（常量导出）', () => {
  it('所有防护阈值已定义且为正数', () => {
    expect(L.MAX_PLAN_SPLIT_LOGS).toBeGreaterThan(0)
    expect(L.MAX_LOG_CONTENT_CHARS).toBeGreaterThan(0)
    expect(L.STREAM_FLUSH_INTERVAL_MS).toBeGreaterThan(0)
    expect(L.PROCESSING_TIMEOUT_MS).toBeGreaterThan(0)
    expect(L.ANOMALOUS_CONTENT_STREAK_LIMIT).toBeGreaterThan(0)
    expect(L.ANOMALOUS_LONG_CONTENT_CHARS).toBeGreaterThan(0)
  })

  it('常量值符合设计（防意外回归）', () => {
    expect(L.MAX_PLAN_SPLIT_LOGS).toBe(2000)
    expect(L.MAX_LOG_CONTENT_CHARS).toBe(100_000)
    expect(L.STREAM_FLUSH_INTERVAL_MS).toBe(50)
    expect(L.PROCESSING_TIMEOUT_MS).toBe(120_000)
    expect(L.ANOMALOUS_CONTENT_STREAK_LIMIT).toBe(5)
    expect(L.ANOMALOUS_LONG_CONTENT_CHARS).toBe(20_000)
  })
})
