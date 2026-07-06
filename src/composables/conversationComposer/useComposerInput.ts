/**
 * useComposerInput — 输入框解析、光标度量、IME、键盘行为与面板状态刷新。
 *
 * 职责说明：
 * - 输入解析：parsedInputText（把输入文本切成 text/file/slash/attachment 片段，供渲染层渲染）。
 * - 光标度量：getCaretCoordinates（基于镜像 div 测量光标像素位置）。
 * - 面板状态刷新：updateSlashCommandState（按当前输入决定是否打开/关闭斜杠或 /cd 面板）。
 * - 输入事件：handleInput（含控制字符清洗、@提及触发、斜杠面板刷新）。
 * - IME：handleCompositionStart / handleCompositionEnd。
 * - 键盘：handleKeyDown（退格整段删除 token / 回车发送）。
 * handleKeyDown 在回车时会调用发送逻辑，故依赖 useComposerSender 暴露的 handleSend（单向依赖：input → sender）。
 */
import { computed } from 'vue'
import { FILE_MENTION_PATTERN, getMentionDisplayText, getMentionTitle } from '@/utils/fileMention'
import {
  ATTACHMENT_PLACEHOLDER_PATTERN,
  consumeTokenGap,
  deleteTokenRange,
  getLeadingSlashSegment,
  sanitizeComposerText,
  syncTextareaCaret,
  composerDebug,
  type TextSegment
} from './composerHelpers'
import type { ComposerSharedContext } from './useComposerShared'

/** sender 子 composable 中需要被消费的最小切片。 */
export interface ComposerInputSenderDeps {
  handleSend: () => Promise<void>
}

export function useComposerInput(
  ctx: ComposerSharedContext,
  sender: ComposerInputSenderDeps
) {
  const {
    settingsStore,
    inputText,
    textareaRef,
    renderLayerRef,
    currentFileMentions,
    isInputComposing,
    showFileMention,
    showSlashCommand,
    showCdPathSuggestions,
    mentionStart,
    mentionSearchText,
    openFileMention,
    openSlashCommand,
    openCdPathSuggestions,
    closeFileMention,
    closeSlashCommand,
    closeCdPathSuggestions,
    options
  } = ctx

  const parsedInputText = computed<TextSegment[]>(() => {
    const text = inputText.value
    if (!text) return []

    const segments: TextSegment[] = []
    const leadingSlash = getLeadingSlashSegment(text)
    let lastIndex = 0
    let match: RegExpExecArray | null

    if (leadingSlash) {
      const { trailingSpace, nextIndex } = consumeTokenGap(text, leadingSlash.length)
      segments.push({
        type: 'slash',
        content: leadingSlash.content,
        trailingSpace
      })
      lastIndex = nextIndex
    }

    FILE_MENTION_PATTERN.lastIndex = 0
    ATTACHMENT_PLACEHOLDER_PATTERN.lastIndex = 0
    const tokenMatches: Array<
      { kind: 'file'; match: RegExpExecArray } |
      { kind: 'attachment'; match: RegExpExecArray }
    > = []

    while ((match = FILE_MENTION_PATTERN.exec(text)) !== null) {
      tokenMatches.push({ kind: 'file', match })
    }

    let attachmentMatch: RegExpExecArray | null
    while ((attachmentMatch = ATTACHMENT_PLACEHOLDER_PATTERN.exec(text)) !== null) {
      tokenMatches.push({ kind: 'attachment', match: attachmentMatch })
    }

    tokenMatches.sort((left, right) => left.match.index - right.match.index)

    for (const entry of tokenMatches) {
      const nextMatch = entry.match
      if (nextMatch.index < lastIndex) {
        continue
      }

      if (nextMatch.index > lastIndex) {
        const content = text.slice(lastIndex, nextMatch.index)
        if (content) {
          segments.push({
            type: 'text',
            content
          })
        }
      }

      if (entry.kind === 'file') {
        match = entry.match
        const literal = match[0]
        const fullPath = match[1] ?? match[2]
        const mappedMention = currentFileMentions.value.find(mention => mention.displayText === literal)
        const { trailingSpace, nextIndex } = consumeTokenGap(text, match.index + match[0].length)

        segments.push({
          type: 'file',
          content: literal,
          displayContent: mappedMention?.displayText ?? getMentionDisplayText(literal, fullPath),
          fullPath: mappedMention?.fullPath ?? fullPath,
          titleContent: mappedMention?.titleText ?? getMentionTitle(fullPath),
          trailingSpace
        })

        lastIndex = nextIndex
        continue
      }

      if (entry.kind === 'attachment') {
        attachmentMatch = entry.match
        const attachmentIndex = parseInt(attachmentMatch[2], 10)
        const attachmentKind = attachmentMatch[1]
        const isImage = attachmentKind === 'Image'
        const { trailingSpace, nextIndex } = consumeTokenGap(text, attachmentMatch.index + attachmentMatch[0].length)

        segments.push({
          type: 'attachment',
          content: attachmentMatch[0],
          attachmentType: isImage ? 'image' : 'file',
          attachmentIndex,
          trailingSpace
        })

        lastIndex = nextIndex
      }
    }

    if (lastIndex < text.length) {
      const content = text.slice(lastIndex)
      if (content) {
        segments.push({
          type: 'text',
          content
        })
      }
    }

    return segments
  })

  const getCaretCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
    const mirror = document.createElement('div')
    const marker = document.createElement('span')
    const style = window.getComputedStyle(textarea)
    const value = textarea.value.slice(0, position)

    const mirroredText = value.length > 0 ? value : '.'
    const lastChar = mirroredText[mirroredText.length - 1]

    const propertiesToCopy = [
      'boxSizing',
      'width',
      'height',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'textIndent',
      'textTransform',
      'wordSpacing',
      'whiteSpace',
      'overflowWrap',
      'wordBreak',
      'tabSize'
    ] as const

    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'anywhere'
    mirror.style.wordBreak = 'break-word'
    mirror.style.top = '0'
    mirror.style.left = '0'
    mirror.style.pointerEvents = 'none'

    propertiesToCopy.forEach((property) => {
      mirror.style[property] = style[property]
    })

    mirror.textContent = mirroredText.slice(0, -1)
    marker.textContent = lastChar === '\n' ? '\u200b' : lastChar
    mirror.appendChild(marker)
    document.body.appendChild(mirror)

    const markerRect = marker.getBoundingClientRect()
    const mirrorRect = mirror.getBoundingClientRect()
    const x = markerRect.right - mirrorRect.left - textarea.scrollLeft
    const y = markerRect.top - mirrorRect.top - textarea.scrollTop

    document.body.removeChild(mirror)
    return { x, y }
  }

  const updateSlashCommandState = (target: HTMLTextAreaElement, value: string, cursorPosition: number) => {
    if (!value.startsWith('/')) {
      closeSlashCommand()
      closeCdPathSuggestions()
      return
    }

    const currentLineValue = value.slice(0, cursorPosition)
    if (currentLineValue.includes('\n')) {
      closeSlashCommand()
      closeCdPathSuggestions()
      return
    }

    if (options.panelType === 'mini' && currentLineValue.startsWith('/cd ')) {
      const rect = target.getBoundingClientRect()
      const caretPos = getCaretCoordinates(target, cursorPosition)
      openCdPathSuggestions(rect.left + caretPos.x, rect.top + caretPos.y + 18, currentLineValue.slice(4))
      return
    }

    closeCdPathSuggestions()

    const body = value.slice(1, cursorPosition)
    if (!body || /\s/.test(body)) {
      if (value === '/') {
        const rect = target.getBoundingClientRect()
        const caretPos = getCaretCoordinates(target, cursorPosition)
        openSlashCommand(rect.left + caretPos.x, rect.top + caretPos.y + 18, '')
      } else {
        closeSlashCommand()
      }
      return
    }

    const rect = target.getBoundingClientRect()
    const caretPos = getCaretCoordinates(target, cursorPosition)
    openSlashCommand(rect.left + caretPos.x, rect.top + caretPos.y + 18, body)
  }

  const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement
    let value = target.value
    let cursorPosition = target.selectionStart || 0
    const sanitizedValue = sanitizeComposerText(value)

    if (sanitizedValue !== value) {
      composerDebug('input-sanitized', { hadControlChars: true })
      cursorPosition = sanitizeComposerText(value.slice(0, cursorPosition)).length
      value = sanitizedValue
      target.value = sanitizedValue
      target.setSelectionRange(cursorPosition, cursorPosition)
    }

    if (showFileMention.value && mentionStart.value >= 0) {
      if (value[mentionStart.value] !== '@') {
        closeFileMention()
      } else if (cursorPosition < mentionStart.value || cursorPosition > mentionStart.value + 100) {
        closeFileMention()
      } else {
        mentionSearchText.value = value.slice(mentionStart.value + 1, cursorPosition)
      }
      inputText.value = value
      return
    }

    if (value.length > 0 && cursorPosition > 0 && value[cursorPosition - 1] === '@') {
      const rect = target.getBoundingClientRect()
      const caretPos = getCaretCoordinates(target, cursorPosition)
      openFileMention(rect.left + caretPos.x, rect.top + caretPos.y + 20, '', cursorPosition - 1)
    }

    inputText.value = value
    composerDebug('input', { valueLen: value.length, cursorPos: cursorPosition })
    updateSlashCommandState(target, value, cursorPosition)
  }

  const handleCompositionStart = () => {
    isInputComposing.value = true
  }

  const handleCompositionEnd = () => {
    isInputComposing.value = false
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    const normalizedEvent = event as KeyboardEvent & { keyCode?: number; isComposing?: boolean }
    if (normalizedEvent.isComposing || isInputComposing.value || normalizedEvent.keyCode === 229) {
      return
    }

    if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const textarea = textareaRef.value
      if (textarea) {
        const cursorPos = textarea.selectionStart
        const selEnd = textarea.selectionEnd
        if (cursorPos === selEnd && cursorPos > 0) {
          const text = inputText.value
          const before = text.slice(0, cursorPos)

          const slashMatch = before.match(/\/[^\s\n]*\s*$/)
          if (slashMatch) {
            event.preventDefault()
            const deleteStart = cursorPos - slashMatch[0].length
            const { newText, newPosition } = deleteTokenRange(text, deleteStart, cursorPos)
            textarea.value = newText
            inputText.value = newText
            composerDebug('backspace', { matchType: 'slash', deleteStart, deleteEnd: cursorPos })
            requestAnimationFrame(() => {
              syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
              updateSlashCommandState(textarea, newText, newPosition)
            })
            return
          }

          const attachMatch = before.match(/\[(Image|File)\d+\]\s*$/)
          if (attachMatch) {
            event.preventDefault()
            const deleteStart = cursorPos - attachMatch[0].length
            const { newText, newPosition } = deleteTokenRange(text, deleteStart, cursorPos)
            textarea.value = newText
            inputText.value = newText
            composerDebug('backspace', { matchType: 'attachment', deleteStart, deleteEnd: cursorPos })
            requestAnimationFrame(() => {
              syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
            })
            return
          }

          const fileMentionMatch = before.match(/@"[^"\n]+"\s*$|@[^\s@"]+\s*$/)
          if (fileMentionMatch) {
            event.preventDefault()
            const deleteStart = cursorPos - fileMentionMatch[0].length
            const { newText, newPosition } = deleteTokenRange(text, deleteStart, cursorPos)
            textarea.value = newText
            inputText.value = newText
            composerDebug('backspace', { matchType: 'file-mention', deleteStart, deleteEnd: cursorPos })
            requestAnimationFrame(() => {
              syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
            })
            return
          }
        }
      }
    }

    if (showFileMention.value || showSlashCommand.value || showCdPathSuggestions.value) {
      return
    }

    if (event.key === 'Enter') {
      const sendOnEnter = settingsStore.settings.sendOnEnter

      if (sendOnEnter && !event.shiftKey) {
        event.preventDefault()
        void sender.handleSend()
      } else if (!sendOnEnter && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void sender.handleSend()
      }
    }
  }

  return {
    parsedInputText,
    getCaretCoordinates,
    updateSlashCommandState,
    handleInput,
    handleCompositionStart,
    handleCompositionEnd,
    handleKeyDown
  }
}
