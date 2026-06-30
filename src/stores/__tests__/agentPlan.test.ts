import { describe, expect, it } from 'vitest'
import { parsePlanJson } from '@/stores/agentPlan'
import { parseAvailableCommandsJson } from '@/stores/agentCapability'

describe('parsePlanJson', () => {
  it('解析标准 ACP Plan JSON', () => {
    const json = JSON.stringify({
      entries: [
        { content: '读取需求', priority: 'high', status: 'completed' },
        { content: '编写代码', priority: 'medium', status: 'in_progress' },
        { content: '补充测试', priority: 'low', status: 'pending' }
      ]
    })
    const plan = parsePlanJson(json)
    expect(plan).not.toBeNull()
    expect(plan!.entries).toHaveLength(3)
    expect(plan!.entries[0]).toEqual({
      content: '读取需求',
      priority: 'high',
      status: 'completed'
    })
  })

  it('缺失 priority/status 时降级为默认值', () => {
    const json = JSON.stringify({ entries: [{ content: '无优先级' }] })
    const plan = parsePlanJson(json)
    expect(plan).not.toBeNull()
    expect(plan!.entries[0]).toEqual({
      content: '无优先级',
      priority: 'medium',
      status: 'pending'
    })
  })

  it('非法 JSON 返回 null', () => {
    expect(parsePlanJson('not-json')).toBeNull()
  })

  it('entries 非数组返回 null', () => {
    expect(parsePlanJson(JSON.stringify({ entries: 'oops' }))).toBeNull()
  })

  it('空 entries 返回空计划', () => {
    const plan = parsePlanJson(JSON.stringify({ entries: [] }))
    expect(plan).not.toBeNull()
    expect(plan!.entries).toHaveLength(0)
  })

  it('忽略未知 priority 值并降级为 medium', () => {
    const json = JSON.stringify({ entries: [{ content: 'x', priority: 'critical', status: 'pending' }] })
    const plan = parsePlanJson(json)
    expect(plan!.entries[0].priority).toBe('medium')
  })
})

describe('parseAvailableCommandsJson', () => {
  it('解析标准命令列表', () => {
    const json = JSON.stringify([
      { name: 'create_plan', description: '创建计划', hint: '描述目标' },
      { name: 'research_codebase', description: '研究代码库', hint: null }
    ])
    const cmds = parseAvailableCommandsJson(json)
    expect(cmds).toHaveLength(2)
    expect(cmds[0]).toEqual({ name: 'create_plan', description: '创建计划', hint: '描述目标' })
    expect(cmds[1].hint).toBeUndefined()
  })

  it('过滤掉空 name 的命令', () => {
    const json = JSON.stringify([
      { name: 'valid', description: 'ok' },
      { name: '', description: 'empty' }
    ])
    expect(parseAvailableCommandsJson(json)).toHaveLength(1)
  })

  it('非数组返回空列表', () => {
    expect(parseAvailableCommandsJson(JSON.stringify({ foo: 'bar' }))).toEqual([])
  })

  it('非法 JSON 返回空列表', () => {
    expect(parseAvailableCommandsJson('broken')).toEqual([])
  })

  it('缺失 description 降级为空串', () => {
    const json = JSON.stringify([{ name: 'noDesc' }])
    const cmds = parseAvailableCommandsJson(json)
    expect(cmds[0]).toEqual({ name: 'noDesc', description: '' })
  })
})
