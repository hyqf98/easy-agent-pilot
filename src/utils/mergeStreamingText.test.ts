import { describe, it, expect } from 'vitest'
import { mergeStreamingText } from './mergeStreamingText'

describe('mergeStreamingText', () => {
  it('空 incoming 返回 current 不变', () => {
    expect(mergeStreamingText('hello', '')).toBe('hello')
  })

  it('空 current 返回 incoming', () => {
    expect(mergeStreamingText('', 'hello')).toBe('hello')
  })

  it('多段增量按到达顺序纯追加', () => {
    expect(mergeStreamingText('foo', 'bar')).toBe('foobar')
    expect(mergeStreamingText(mergeStreamingText('foo', 'bar'), 'baz')).toBe('foobarbaz')
  })

  /**
   * 回归：诊断测试 acp_opencode_streaming.rs 观察到的真实 chunk 序列。
   * opencode 把代码块 `` `\`\` `hello\ntext\n`` ``` 拆成 7 个增量 chunk 推送，
   * 纯追加后还原出完整、有序的 markdown 代码块。
   */
  it('markdown 代码块被拆成多个 chunk 时纯追加还原完整结构', () => {
    const chunks = ['``', '`\n', 'hello', '\n', 'text', '\n', '```']
    const result = chunks.reduce(mergeStreamingText, '')
    expect(result).toBe('```\nhello\ntext\n```')
  })

  /**
   * 回归核心 bug：增量恰好是当前文本的子串/后缀时，不应丢弃。
   * 旧实现因 isSnapshotProneContentRuntime 对 opencode 返回 true，
   * `current.endsWith(incoming)` 会误判并丢弃 incoming，导致代码块残缺。
   */
  it('incoming 是 current 的后缀时仍正确追加（不丢弃）', () => {
    // current="```" incoming="```" → 旧实现 endsWith 命中会丢弃，应为 6 个反引号
    expect(mergeStreamingText('```', '```')).toBe('``````')
  })

  it('incoming 是 current 的子串时仍正确追加（不替换）', () => {
    // current="hello world" incoming="hello" → 旧实现 includes 命中会用 incoming 替换，应追加
    expect(mergeStreamingText('hello world', 'hello')).toBe('hello worldhello')
  })

  it('incoming 以 current 为前缀时仍正确追加（不替换为快照）', () => {
    // current="hello" incoming="hello world" → 旧实现 startsWith 命中会用 incoming 替换
    // 纯追加模式下应得到 "hellohello world"，保证不丢内容
    expect(mergeStreamingText('hello', 'hello world')).toBe('hellohello world')
  })

  /**
   * 回归：含重复 `` ` `` 符号的文本，旧 findTextOverlapLength 会错误检测重叠。
   */
  it('含大量重复反引号的文本不触发错误重叠截断', () => {
    const chunks = ['`', '`', '`', 'code', '`', '`', '`']
    const result = chunks.reduce(mergeStreamingText, '')
    expect(result).toBe('```code```')
  })

  it('模拟完整 assistant 回复：引导文本 + 代码块', () => {
    const chunks = [
      'hello.txt',
      ' 的内容是：\n',
      '```\n',
      'hello\n',
      'text\n',
      '```'
    ]
    const result = chunks.reduce(mergeStreamingText, '')
    expect(result).toContain('```')
    expect(result).toContain('hello')
    expect(result).toContain('text')
    expect(result).toBe('hello.txt 的内容是：\n```\nhello\ntext\n```')
  })
})
