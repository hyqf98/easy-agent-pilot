/** 项目记忆系统提示词构建与片段裁剪。 */
import type { MemoryLibrary } from '@/types/memory'

const MAX_TOTAL_CHARS = 12000
const MAX_SECTION_CHARS = 3200
const MIN_REMAINING_SECTION_CHARS = 400

interface PromptSection {
  names: string[]
  descriptions: string[]
  content: string
}

/** 记忆片段通用输入（库或仓库均适用）。 */
export interface MemoryPromptInput {
  id: string
  name: string
  description?: string
  content: string
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trim()
}

function truncateContent(content: string, limit: number): string {
  if (content.length <= limit) {
    return content
  }

  const trimmed = content.slice(0, Math.max(0, limit - 19)).trimEnd()
  return `${trimmed}\n\n[已截断剩余内容]`
}

function buildPromptFromSections(sections: PromptSection[]): string | null {
  if (sections.length === 0) {
    return null
  }

  const header = [
    '以下内容来自当前项目挂载的长期记忆库，请把它们当作系统级约束和背景信息。',
    '执行任务与回答时优先遵守这些约束，但如果用户当前消息给出了更明确的新要求，以当前消息为准。',
    '不要向用户机械复述整段记忆内容。'
  ].join('\n')

  const parts = [header]
  let remaining = MAX_TOTAL_CHARS - header.length

  for (const section of sections) {
    if (remaining < MIN_REMAINING_SECTION_CHARS) {
      parts.push('\n## 其他挂载记忆\n部分挂载记忆因上下文预算限制未展开。')
      break
    }

    const description = Array.from(new Set(section.descriptions)).join('；')
    const prefix = [
      '',
      `## 记忆库：${Array.from(new Set(section.names)).join(' / ')}`,
      description ? `说明：${description}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const availableForContent = Math.max(
      MIN_REMAINING_SECTION_CHARS,
      Math.min(MAX_SECTION_CHARS, remaining - prefix.length - 2)
    )
    const content = truncateContent(section.content, availableForContent)
    const block = `${prefix}\n${content}`

    parts.push(block)
    remaining -= block.length
  }

  return parts.join('\n\n').trim()
}

export function buildProjectMemorySystemPrompt(libraries: MemoryLibrary[]): string | null {
  return buildMemoryPromptFromInputs(
    libraries.map((library) => ({
      id: library.id,
      name: library.name,
      description: library.description,
      content: library.contentMd
    }))
  )
}

/** 通用版本：从任意记忆片段（库或仓库主文件）构建系统提示词块。 */
export function buildMemoryPromptFromInputs(inputs: MemoryPromptInput[]): string | null {
  const uniqueById = new Set<string>()
  const sectionByContent = new Map<string, PromptSection>()

  for (const input of inputs) {
    if (uniqueById.has(input.id)) {
      continue
    }
    uniqueById.add(input.id)

    const content = normalizeContent(input.content)
    if (!content) {
      continue
    }

    const existing = sectionByContent.get(content)
    if (existing) {
      existing.names.push(input.name)
      if (input.description?.trim()) {
        existing.descriptions.push(input.description.trim())
      }
      continue
    }

    sectionByContent.set(content, {
      names: [input.name],
      descriptions: input.description?.trim() ? [input.description.trim()] : [],
      content
    })
  }

  return buildPromptFromSections(Array.from(sectionByContent.values()))
}
