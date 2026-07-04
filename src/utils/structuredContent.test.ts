import { describe, it, expect } from 'vitest'
import { parseStructuredContent } from './structuredContent'

describe('parseStructuredContent — form-request field-tag parsing', () => {
  it('parses self-closing <field .../> tags', () => {
    const content = `<form-request>
<formSchema formId="req" title="需求">
<field name="lang" label="语言" type="select" />
</formSchema>
</form-request>`
    const blocks = parseStructuredContent(content)
    const formBlock = blocks.find(b => b.type === 'form')
    expect(formBlock).toBeTruthy()
    expect(formBlock!.type === 'form' && formBlock!.formSchema.fields.length).toBe(1)
  })

  it('parses nested <field> with <options><option> children (model non-JSON format)', () => {
    const content = `<form-request>
<formSchema formId="req" title="需求收集">
<field name="projectType" label="项目类型" type="select" required="true">
<options>
<option value="web">Web 应用</option>
<option value="desktop">桌面应用</option>
<option value="mobile">移动应用</option>
</options>
</field>
<field name="techStack" label="技术栈" type="text" />
</formSchema>
</form-request>`
    const blocks = parseStructuredContent(content)
    const formBlock = blocks.find(b => b.type === 'form')
    expect(formBlock).toBeTruthy()
    if (formBlock?.type !== 'form') return
    expect(formBlock.formSchema.fields.length).toBe(2)
    const projectType = formBlock.formSchema.fields.find(f => f.name === 'projectType')
    expect(projectType).toBeTruthy()
    expect(projectType!.options).toBeDefined()
    expect(projectType!.options!.length).toBe(3)
    expect(projectType!.options![0]).toEqual({ label: 'Web 应用', value: 'web' })
    expect(projectType!.options![2]).toEqual({ label: '移动应用', value: 'mobile' })
  })

  it('falls back to id attribute when name is absent (glm-5.2 uses id)', () => {
    const content = `<form-request>
<title>需求</title>
<field id="project_type" label="项目类型" type="select" required="true">
<options>
<option value="web_app">Web 应用</option>
</options>
</field>
</form-request>`
    const blocks = parseStructuredContent(content)
    const formBlock = blocks.find(b => b.type === 'form')
    expect(formBlock).toBeTruthy()
    if (formBlock?.type !== 'form') return
    expect(formBlock.formSchema.fields.length).toBe(1)
    expect(formBlock.formSchema.fields[0].name).toBe('project_type')
    expect(formBlock.formSchema.fields[0].options).toBeDefined()
    expect(formBlock.formSchema.fields[0].options!.length).toBe(1)
  })

  it('normalizes fullwidth quotes in field attributes', () => {
    const content = `<form-request>
<field name=“lang” label=“语言” type=“select” options=“[{"label":"JS","value":"js"}]” />
</form-request>`
    const blocks = parseStructuredContent(content)
    const formBlock = blocks.find(b => b.type === 'form')
    expect(formBlock).toBeTruthy()
  })

  it('returns no form block when no field tags present', () => {
    const content = '这是普通文本，没有表单。'
    const blocks = parseStructuredContent(content)
    expect(blocks.find(b => b.type === 'form')).toBeUndefined()
  })

  it('handles mixed markdown + form-request', () => {
    const content = `# 需求确认

让我先问几个问题：

<form-request>
<field name="q1" label="问题1" type="text" />
</form-request>

请在表单中回答。`
    const blocks = parseStructuredContent(content)
    const formBlock = blocks.find(b => b.type === 'form')
    const mdBlocks = blocks.filter(b => b.type === 'markdown')
    expect(formBlock).toBeTruthy()
    expect(mdBlocks.length).toBeGreaterThanOrEqual(1)
  })
})
