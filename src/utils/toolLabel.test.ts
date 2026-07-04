import { describe, it, expect } from 'vitest'
import { getToolNameCn, getToolKindLabelCn, getToolPrimaryFileBasename } from './toolLabel'

describe('getToolNameCn', () => {
  it('maps common ACP tool names to Chinese', () => {
    expect(getToolNameCn('Read')).toBe('读取文件')
    expect(getToolNameCn('Write')).toBe('写入文件')
    expect(getToolNameCn('Edit')).toBe('编辑文件')
    expect(getToolNameCn('MultiEdit')).toBe('批量编辑')
    expect(getToolNameCn('Glob')).toBe('搜索文件')
    expect(getToolNameCn('Grep')).toBe('搜索内容')
    expect(getToolNameCn('Bash')).toBe('执行命令')
    expect(getToolNameCn('WebFetch')).toBe('抓取网页')
    expect(getToolNameCn('TodoWrite')).toBe('更新待办')
  })

  it('handles case-insensitive matching', () => {
    expect(getToolNameCn('read')).toBe('读取文件')
    expect(getToolNameCn('WRITE')).toBe('写入文件')
    expect(getToolNameCn('bash')).toBe('执行命令')
  })

  it('handles separators (- _ .)', () => {
    expect(getToolNameCn('web-fetch')).toBe('抓取网页')
    expect(getToolNameCn('web_fetch')).toBe('抓取网页')
    expect(getToolNameCn('todo.write')).toBe('更新待办')
  })

  it('falls back to fuzzy keyword match for unknown names', () => {
    expect(getToolNameCn('read_file_content')).toBe('读取文件')
    expect(getToolNameCn('custom_write_tool')).toBe('写入文件')
  })

  it('returns the original name when nothing matches', () => {
    expect(getToolNameCn('SomeUnknownTool')).toBe('SomeUnknownTool')
  })

  it('returns empty string for empty input', () => {
    expect(getToolNameCn('')).toBe('')
  })
})

describe('getToolKindLabelCn', () => {
  it('maps ACP ToolKind to Chinese category', () => {
    expect(getToolKindLabelCn('read')).toBe('读取')
    expect(getToolKindLabelCn('edit')).toBe('修改')
    expect(getToolKindLabelCn('delete')).toBe('删除')
    expect(getToolKindLabelCn('move')).toBe('移动')
    expect(getToolKindLabelCn('search')).toBe('搜索')
    expect(getToolKindLabelCn('execute')).toBe('执行')
    expect(getToolKindLabelCn('think')).toBe('思考')
    expect(getToolKindLabelCn('fetch')).toBe('获取')
  })

  it('returns empty for undefined/unknown kind', () => {
    expect(getToolKindLabelCn(undefined)).toBe('')
    expect(getToolKindLabelCn('')).toBe('')
    expect(getToolKindLabelCn('unknown')).toBe('')
  })
})

describe('getToolPrimaryFileBasename', () => {
  it('extracts basename from locations[0]', () => {
    expect(getToolPrimaryFileBasename({
      locations: [{ path: '/abs/src/components/Foo.vue', relativePath: 'src/components/Foo.vue' }],
      arguments: {}
    })).toBe('Foo.vue')
  })

  it('extracts basename from arguments.file_path when no locations', () => {
    expect(getToolPrimaryFileBasename({
      arguments: { file_path: 'src/utils/helper.ts' }
    })).toBe('helper.ts')
  })

  it('extracts basename from arguments.path', () => {
    expect(getToolPrimaryFileBasename({
      arguments: { path: '/abs/path/to/readme.md' }
    })).toBe('readme.md')
  })

  it('returns null when no file path available', () => {
    expect(getToolPrimaryFileBasename({ arguments: { command: 'ls' } })).toBeNull()
    expect(getToolPrimaryFileBasename({ arguments: {} })).toBeNull()
  })

  it('prefers locations over arguments', () => {
    expect(getToolPrimaryFileBasename({
      locations: [{ path: '/abs/a/b/loc.txt', relativePath: 'a/b/loc.txt' }],
      arguments: { file_path: 'c/d/arg.txt' }
    })).toBe('loc.txt')
  })
})
