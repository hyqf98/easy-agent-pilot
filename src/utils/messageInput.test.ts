import { describe, expect, it } from 'vitest'
import {
  applyMentionToText,
  parseMentionAtCaret,
  shouldSendOnEnter,
  type MentionCandidate
} from './messageInput'

const candidates: MentionCandidate[] = [
  { index: 0, title: '修复登录页' },
  { index: 1, title: '优化首页性能' },
  { index: 2, title: '编写单元测试' }
]

describe('parseMentionAtCaret', () => {
  it('光标前无 @ 时返回 null', () => {
    expect(parseMentionAtCaret('hello world', 5, candidates)).toBeNull()
  })

  it('解析文本起始的 @mention', () => {
    const text = '@修'
    const result = parseMentionAtCaret(text, 2, candidates)!
    expect(result.rangeStart).toBe(0)
    expect(result.rangeEnd).toBe(2)
    expect(result.options.map(o => o.title)).toEqual(['修复登录页'])
  })

  it('按 index+1 数字过滤', () => {
    const result = parseMentionAtCaret('@2', 2, candidates)!
    expect(result.options.map(o => o.index)).toEqual([1])
  })

  it('按 title 关键字过滤（大小写无关）', () => {
    const result = parseMentionAtCaret('@首页', 3, candidates)!
    expect(result.options.map(o => o.title)).toEqual(['优化首页性能'])
  })

  it('@ 紧跟非空白字符不触发（避免邮箱误判）', () => {
    expect(parseMentionAtCaret('a@b', 3, candidates)).toBeNull()
  })

  it('提及文本含空白时返回 null', () => {
    expect(parseMentionAtCaret('@修复 登录', 6, candidates)).toBeNull()
  })

  it('无候选时返回 null', () => {
    expect(parseMentionAtCaret('@x', 2, [])).toBeNull()
  })

  it('key 包含起始位置与 query，便于去重', () => {
    const result = parseMentionAtCaret('hi @修复', 6, candidates)!
    expect(result.key).toBe('3:修复')
  })
})

describe('shouldSendOnEnter', () => {
  // node 测试环境无 KeyboardEvent，构造最小桩对象（函数只读取 key/修饰键）
  function key(key: string, mods: { shift?: boolean; ctrl?: boolean; meta?: boolean } = {}): KeyboardEvent {
    return { key, shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta } as KeyboardEvent
  }

  it('Enter 无修饰键触发发送', () => {
    expect(shouldSendOnEnter(key('Enter'))).toBe(true)
  })

  it('Shift+Enter 不发送（换行）', () => {
    expect(shouldSendOnEnter(key('Enter', { shift: true }))).toBe(false)
  })

  it('非 Enter 键不发送', () => {
    expect(shouldSendOnEnter(key('a'))).toBe(false)
  })

  it('Ctrl/Meta+Enter 不发送', () => {
    expect(shouldSendOnEnter(key('Enter', { ctrl: true }))).toBe(false)
    expect(shouldSendOnEnter(key('Enter', { meta: true }))).toBe(false)
  })
})

describe('applyMentionToText', () => {
  it('用选中候选替换 @片段并给出新光标位置', () => {
    const mention = parseMentionAtCaret('修改 @修复', 7, candidates)!
    const option = mention.options[0]
    const result = applyMentionToText('修改 @修复', mention, option)!
    expect(result.text).toBe('修改 @[1:修复登录页] ')
    expect(result.caret).toBe('修改 @[1:修复登录页] '.length)
  })

  it('候选无效时返回 null', () => {
    const mention = parseMentionAtCaret('@修', 2, candidates)!
    expect(applyMentionToText('@修', mention, undefined as unknown as MentionCandidate)).toBeNull()
  })
})
