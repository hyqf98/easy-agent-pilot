import type { Task } from '@/types/plan'
import type { TaskExecutionResultRecord } from '@/types/taskExecution'
import { extractExecutionResult } from '@/utils/structuredContent'

export function parseExecutionResult(content: string): { summary: string; files: string[] } {
  const trimmed = content.trim()
  if (!trimmed) {
    return {
      summary: '任务已执行完成（无详细输出）',
      files: []
    }
  }

  const parsedResult = extractExecutionResult(trimmed)
  if (parsedResult) {
    return {
      summary: parsedResult.summary || fallbackSummary(trimmed),
      files: uniqueStrings([
        ...parsedResult.generatedFiles.map(file => `added:${file}`),
        ...parsedResult.modifiedFiles.map(file => `modified:${file}`),
        ...parsedResult.changedFiles.map(file => `changed:${file}`),
        ...parsedResult.deletedFiles.map(file => `deleted:${file}`)
      ])
    }
  }

  return {
    summary: fallbackSummary(trimmed),
    files: uniqueStrings(extractFileLinks(trimmed).map(file => `changed:${file}`))
  }
}

export function buildExecutionPrompt(
  task: Task,
  recentResults: TaskExecutionResultRecord[] = []
): string {
  const parts: string[] = []

  parts.push('# 任务执行')
  parts.push('')

  const recentContext = buildRecentResultsContext(recentResults)
  if (recentContext) {
    parts.push(recentContext)
    parts.push('')
  }

  parts.push('## 任务标题')
  parts.push(task.title)
  parts.push('')

  if (task.description) {
    parts.push('## 任务描述')
    parts.push(task.description)
    parts.push('')
  }

  if (task.implementationSteps && task.implementationSteps.length > 0) {
    parts.push('## 实现步骤')
    task.implementationSteps.forEach((step, index) => {
      parts.push(`${index + 1}. ${step}`)
    })
    parts.push('')
  }

  if (task.testSteps && task.testSteps.length > 0) {
    parts.push('## 测试步骤')
    task.testSteps.forEach((step, index) => {
      parts.push(`${index + 1}. ${step}`)
    })
    parts.push('')
  }

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    parts.push('## 验收标准')
    task.acceptanceCriteria.forEach(criteria => {
      parts.push(`- [ ] ${criteria}`)
    })
    parts.push('')
  }

  if (task.inputResponse && Object.keys(task.inputResponse).length > 0) {
    parts.push('## 用户输入')
    parts.push('用户已提供以下信息：')
    Object.entries(task.inputResponse).forEach(([key, value]) => {
      parts.push(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    })
    parts.push('')
  }

  parts.push('---')
  parts.push('')
  parts.push('请按照以上要求执行任务。')
  parts.push('')
  parts.push('**如需用户输入**，输出 JSON：')
  parts.push('```json')
  parts.push('{"type":"form_request","question":"问题描述","formSchema":{"formId":"id","title":"标题","fields":[{"name":"字段","label":"标签","type":"text"}]}}')
  parts.push('```')
  parts.push('')
  parts.push('**任务完成时**，输出 JSON：')
  parts.push('```json')
  parts.push('{"result_summary":"完成摘要","generated_files":[],"modified_files":[]}')
  parts.push('```')

  return parts.join('\n')
}

function buildRecentResultsContext(results: TaskExecutionResultRecord[]): string {
  if (results.length === 0) return ''

  const lines: string[] = ['## 历史任务（参考）', '']

  results.forEach((result, index) => {
    const status = result.result_status === 'success' ? '✓' : '✗'
    lines.push(`${index + 1}. [${status}] ${result.task_title_snapshot}`)
    if (result.result_summary) {
      lines.push(`   摘要: ${fallbackSummary(result.result_summary)}`)
    }
    if (result.fail_reason) {
      lines.push(`   失败: ${result.fail_reason}`)
    }
  })

  return lines.join('\n')
}

function fallbackSummary(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 280) {
    return normalized
  }
  return `${normalized.slice(0, 280)}...`
}

function extractFileLinks(content: string): string[] {
  const files: string[] = []

  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (match[1]) {
      files.push(match[1].trim())
    }
  }

  for (const match of content.matchAll(/`([^`\n]+(?:\/|\\)[^`\n]+)`/g)) {
    if (match[1]) {
      files.push(match[1].trim())
    }
  }

  return files
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
