/**
 * composerHelpers — 会话输入框（ConversationComposer）的纯函数工具与公共类型声明。
 *
 * 职责说明：
 * - 集中存放与输入框文本清洗、Token 插入/删除、光标同步、斜杠段识别、项目初始化提示构建等
 *   无 Vue 响应式依赖的纯逻辑，供各子 composable 复用。
 * - 声明输入框相关的领域类型（TextSegment / Upload* / UseConversationComposerOptions）。
 * 本文件不持有任何响应式状态，可被任意子 composable 安全引入。
 */
import type { MaybeRefOrGetter } from 'vue'
import logger from '@/utils/logger'
import type { SlashCommandPanelType } from '@/services/slashCommands'

export interface TextSegment {
  type: 'text' | 'file' | 'slash' | 'attachment'
  content: string
  displayContent?: string
  fullPath?: string
  titleContent?: string
  attachmentType?: 'image' | 'file'
  attachmentIndex?: number
  trailingSpace?: boolean
}

export interface UploadImageInput {
  fileName?: string
  mimeType: string
  bytes: number[]
}

export interface UploadSessionImagesResponse {
  attachments: import('@/stores/message').MessageAttachment[]
}

export interface UseConversationComposerOptions {
  panelType: SlashCommandPanelType
  sessionId: MaybeRefOrGetter<string | null | undefined>
  projectPath?: MaybeRefOrGetter<string | null | undefined>
  defaultFileMentionScope?: 'project' | 'global'
  workingDirectory?: MaybeRefOrGetter<string | null | undefined>
  setWorkingDirectory?: (path: string) => Promise<string>
}

export const ATTACHMENT_PLACEHOLDER_PATTERN = /\[(Image|File)(\d+)\]/g

export const COMPOSER_DEBUG = false

export const PROJECT_INIT_SECTION_TITLE = '## Project Architecture Analysis (Auto Generated)'

export function composerDebug(tag: string, payload: Record<string, unknown>) {
  if (!COMPOSER_DEBUG) return
  const ts = performance.now().toFixed(1)
  logger.log(`%c[composer:${tag}] @${ts}ms`, 'color:#0ea5e9;font-weight:600', payload)
}

export function sanitizeComposerText(value: string): string {
  let sanitized = ''

  for (const char of value) {
    const code = char.charCodeAt(0)
    const isControlChar = (code >= 0x00 && code <= 0x08)
      || code === 0x0B
      || code === 0x0C
      || (code >= 0x0E && code <= 0x1F)
      || code === 0x7F

    if (!isControlChar) {
      sanitized += char
    }
  }

  return sanitized
}

export function buildTokenInsertPayload(before: string, token: string, after: string) {
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before)
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after)
  const inserted = `${needsLeadingSpace ? ' ' : ''}${token}${needsTrailingSpace ? ' ' : ''}`
  const raw = `${before}${inserted}${after}`
  const newText = sanitizeComposerText(raw)
  const newPosition = before.length + inserted.length
  composerDebug('token-insert', {
    token: token.length > 40 ? token.slice(0, 40) + '...' : token,
    beforeLen: before.length,
    afterLen: after.length,
    needsLeadingSpace,
    needsTrailingSpace,
    newPosition
  })
  return { newText, newPosition }
}

export function consumeTokenGap(_text: string, startIndex: number) {
  return {
    trailingSpace: false,
    nextIndex: startIndex
  }
}

export function syncTextareaCaret(textarea: HTMLTextAreaElement | null, position: number, renderLayer?: HTMLDivElement | null) {
  if (!textarea) {
    return
  }

  textarea.focus()
  textarea.setSelectionRange(position, position)
  if (renderLayer) {
    renderLayer.scrollTop = textarea.scrollTop
    renderLayer.scrollLeft = textarea.scrollLeft
  }
}

export function deleteTokenRange(text: string, from: number, to: number) {
  const raw = text.slice(0, from) + text.slice(to)
  const newText = raw.replace(/[ \t]{2,}/g, ' ')
  const newPosition = from
  composerDebug('token-delete', {
    from,
    to,
    textLen: text.length,
    newTextLen: newText.length,
    deletedChars: to - from,
    newPosition
  })
  return { newText, newPosition }
}

export function getLeadingSlashSegment(text: string): { content: string; length: number } | null {
  if (!text.startsWith('/')) {
    return null
  }

  const matched = text.match(/^\/[^\s\n]*/)
  if (!matched || !matched[0]) {
    return null
  }

  return {
    content: matched[0],
    length: matched[0].length
  }
}

export function buildProjectInitPrompt(projectPath: string, extraPrompt?: string): string {
  const lines = [
    `请对当前项目执行一次初始化架构分析，项目根目录为：${projectPath}`,
    '',
    '执行要求：',
    '1. 先基于当前仓库真实代码、目录、配置和运行链路完成分析，不要脱离现有实现臆测。',
    '2. 直接使用 CLI 自己读取并更新当前项目根目录的 AGENTS.md，不要只在对话里给建议。',
    '3. 如果 AGENTS.md 已存在，必须保留原有人工规则与内容，只新增或更新一个自动生成区块，不要覆盖整份文件。',
    `4. 自动生成区块标题固定为：${PROJECT_INIT_SECTION_TITLE}`,
    '5. 该区块至少包含：项目概览、核心模块/目录职责、关键运行链路、主要数据与状态流、开发约束、调试排查入口。',
    '6. 内容要简洁、可维护、便于后续 agent 快速理解项目，不要写成长篇空话。',
    '7. 完成后再回复结果，明确说明 AGENTS.md 已更新，并简要概括写入了哪些内容。',
    '',
    '额外约束：',
    '- 你可以读取和编辑项目文件。',
    '- 不要修改 AGENTS.md 之外的文件，除非为了读取上下文所必需。',
    '- 不要输出大段分析草稿到聊天里，重点是把内容落到 AGENTS.md。'
  ]

  if (extraPrompt?.trim()) {
    lines.push('')
    lines.push('用户补充要求：')
    lines.push(extraPrompt.trim())
  }

  return lines.join('\n')
}
