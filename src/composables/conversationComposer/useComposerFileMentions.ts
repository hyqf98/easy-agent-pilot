/**
 * useComposerFileMentions — @文件提及（@file mention）的数据一致性逻辑。
 *
 * 职责说明：
 * - 维护输入文本与 ComposerFileMention 集合的同步：reconcileFileMentions / syncFileMentions /
 *   expandComposerMentions / countMentionsInText / areFileMentionsEqual / createComposerMention。
 * - 选择/插入文件提及：handleFileSelect / insertFileMentions。
 * - 注册 watch(inputText)：在输入变化时做控制字符清洗并重新对齐提及集合（原主文件中的副作用）。
 * 提及的“显隐/坐标/搜索词”等面板状态由 useComposerShared 持有并作为参数注入。
 */
import { watch } from 'vue'
import { type ComposerFileMention } from '@/stores/sessionExecution'
import { FILE_MENTION_PATTERN, isGlobalMentionPath } from '@/utils/fileMention'
import { createComposerFileMention, formatMentionLiteral } from '@/utils/composerFileMention'
import {
  buildTokenInsertPayload,
  sanitizeComposerText,
  syncTextareaCaret,
  composerDebug
} from './composerHelpers'
import type { ComposerSharedContext } from './useComposerShared'

export function useComposerFileMentions(ctx: ComposerSharedContext) {
  const {
    currentSessionId,
    currentFileMentions,
    inputText,
    textareaRef,
    renderLayerRef,
    sessionExecutionStore,
    closeFileMention
  } = ctx

  const createComposerMention = (fullPath: string): ComposerFileMention => {
    return createComposerFileMention({ fullPath })
  }

  const countMentionsInText = (text: string) => {
    let count = 0
    FILE_MENTION_PATTERN.lastIndex = 0
    while (FILE_MENTION_PATTERN.exec(text) !== null) {
      count += 1
    }
    return count
  }

  const areFileMentionsEqual = (left: ComposerFileMention[], right: ComposerFileMention[]) => (
    left.length === right.length && left.every((mention, index) =>
      mention.id === right[index]?.id
      && mention.displayText === right[index]?.displayText
      && mention.fullPath === right[index]?.fullPath
      && mention.insertText === right[index]?.insertText
    )
  )

  const reconcileFileMentions = (text: string, mentions: ComposerFileMention[]) => {
    const mentionBuckets = new Map<string, ComposerFileMention[]>()

    mentions.forEach((mention) => {
      const bucket = mentionBuckets.get(mention.displayText) ?? []
      bucket.push(mention)
      mentionBuckets.set(mention.displayText, bucket)
    })

    const nextMentions: ComposerFileMention[] = []
    FILE_MENTION_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = FILE_MENTION_PATTERN.exec(text)) !== null) {
      const literal = match[0]
      const path = match[1] ?? match[2]
      const mappedMention = mentionBuckets.get(literal)?.shift()

      if (mappedMention) {
        nextMentions.push(mappedMention)
        continue
      }

      if (isGlobalMentionPath(path)) {
        nextMentions.push(createComposerMention(path))
      }
    }

    return nextMentions
  }

  const syncFileMentions = (text: string, mentions = currentFileMentions.value) => {
    if (!currentSessionId.value) {
      return
    }

    const nextMentions = reconcileFileMentions(text, mentions)
    if (!areFileMentionsEqual(nextMentions, currentFileMentions.value)) {
      sessionExecutionStore.setFileMentions(currentSessionId.value, nextMentions)
    }
  }

  const expandComposerMentions = (text: string, mentions: ComposerFileMention[]) => {
    const mentionBuckets = new Map<string, ComposerFileMention[]>()

    mentions.forEach((mention) => {
      const bucket = mentionBuckets.get(mention.displayText) ?? []
      bucket.push(mention)
      mentionBuckets.set(mention.displayText, bucket)
    })

    FILE_MENTION_PATTERN.lastIndex = 0
    return text.replace(FILE_MENTION_PATTERN, (literal) => {
      const mappedMention = mentionBuckets.get(literal)?.shift()
      return mappedMention?.insertText ?? literal
    })
  }

  const handleFileSelect = (insertPath: string, mentionStartPos: number) => {
    closeFileMention()

    const textarea = textareaRef.value
    const cursorPos = textarea ? textarea.selectionStart : inputText.value.length
    const beforeAt = inputText.value.slice(0, mentionStartPos)
    const afterSearch = inputText.value.slice(cursorPos)

    const isAttachmentPlaceholder = /^\[(Image|File)\d+\]$/.test(insertPath)
    const token = isAttachmentPlaceholder
      ? insertPath
      : (isGlobalMentionPath(insertPath) ? createComposerMention(insertPath) : null)?.displayText ?? formatMentionLiteral(insertPath)

    const { newText, newPosition } = buildTokenInsertPayload(beforeAt, token, afterSearch)

    if (!isAttachmentPlaceholder) {
      const nextMention = isGlobalMentionPath(insertPath) ? createComposerMention(insertPath) : null
      const nextMentions = [...reconcileFileMentions(inputText.value, currentFileMentions.value)]

      if (nextMention) {
        nextMentions.splice(countMentionsInText(beforeAt), 0, nextMention)
        if (currentSessionId.value) {
          sessionExecutionStore.setFileMentions(currentSessionId.value, nextMentions)
        }
      }
    }

    if (textarea) {
      textarea.value = newText
    }

    inputText.value = newText
    composerDebug('file-select', { mentionStart: mentionStartPos, token, isAttachment: isAttachmentPlaceholder, newPosition })

    requestAnimationFrame(() => {
      syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
    })
  }

  const insertFileMentions = (paths: string[]) => {
    if (paths.length === 0) {
      return
    }

    const textarea = textareaRef.value
    const baseMentions = [...reconcileFileMentions(inputText.value, currentFileMentions.value)]
    const globalMentions: ComposerFileMention[] = []
    const token = paths.map((path) => {
      if (!isGlobalMentionPath(path)) {
        return formatMentionLiteral(path)
      }

      const mention = createComposerMention(path)
      globalMentions.push(mention)
      return mention.displayText
    }).join(' ')

    if (!textarea) {
      inputText.value += ` ${token}`
      if (currentSessionId.value) {
        sessionExecutionStore.setFileMentions(currentSessionId.value, [...baseMentions, ...globalMentions])
      }
      return
    }

    const start = textarea.selectionStart ?? inputText.value.length
    const end = textarea.selectionEnd ?? inputText.value.length
    const mentionIndex = countMentionsInText(inputText.value.slice(0, start))
    const nextMentions = [...baseMentions]
    nextMentions.splice(mentionIndex, 0, ...globalMentions)
    const before = inputText.value.slice(0, start)
    const after = inputText.value.slice(end)
    const { newText, newPosition } = buildTokenInsertPayload(before, token, after)
    composerDebug('file-mention-insert', { paths: paths.length, token, newPosition })

    textarea.value = newText

    inputText.value = newText
    if (currentSessionId.value) {
      sessionExecutionStore.setFileMentions(currentSessionId.value, nextMentions)
    }

    requestAnimationFrame(() => {
      textarea.focus()
      syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
    })
  }

  // 原主文件副作用：输入变化时清洗控制字符并重新对齐提及集合
  watch(inputText, (value) => {
    const sanitizedValue = sanitizeComposerText(value)
    if (sanitizedValue !== value) {
      inputText.value = sanitizedValue
      return
    }

    syncFileMentions(sanitizedValue)
  })

  return {
    createComposerMention,
    countMentionsInText,
    areFileMentionsEqual,
    reconcileFileMentions,
    syncFileMentions,
    expandComposerMentions,
    handleFileSelect,
    insertFileMentions
  }
}
