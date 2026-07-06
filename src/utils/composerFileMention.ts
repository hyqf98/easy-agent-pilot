/** 输入框文件提及（@mention）与行范围引用构建。 */
import type { ComposerFileMention } from '@/stores/sessionExecution'
import { getMentionDisplayText, getMentionTitle } from '@/utils/fileMention'

export interface ComposerFileMentionInput {
  fullPath: string
  displayText?: string
  titleText?: string
  insertText?: string
}

export interface FileLineRangeReference {
  fullPath: string
  fileName: string
  startLine: number
  endLine: number
}

export function formatMentionLiteral(path: string): string {
  if (!path) {
    return '@'
  }

  if (/\s/.test(path)) {
    return `@"${path.replace(/"/g, '\\"')}"`
  }

  return `@${path}`
}

export function createComposerFileMention(input: ComposerFileMentionInput): ComposerFileMention {
  const literal = formatMentionLiteral(input.fullPath)

  return {
    id: `mention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayText: input.displayText ?? getMentionDisplayText(literal, input.fullPath),
    fullPath: input.fullPath,
    titleText: input.titleText ?? getMentionTitle(input.fullPath),
    insertText: input.insertText ?? literal
  }
}

export function createFileLineRangeMention(input: FileLineRangeReference): ComposerFileMention {
  const startLine = Math.max(1, Math.min(input.startLine, input.endLine))
  const endLine = Math.max(startLine, input.endLine)
  const lineSuffix = startLine === endLine
    ? `第${startLine}行`
    : `第${startLine}-${endLine}行`

  return createComposerFileMention({
    fullPath: input.fullPath,
    displayText: formatMentionLiteral(`${input.fileName} ${lineSuffix}`),
    titleText: `${input.fullPath} (${lineSuffix})`,
    insertText: formatMentionLiteral(`${input.fullPath}#L${startLine}${startLine === endLine ? '' : `-L${endLine}`}`)
  })
}
