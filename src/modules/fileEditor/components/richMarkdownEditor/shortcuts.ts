/** Rich Markdown Editor 的 Markdown 快捷键解析与键入行为（回车/退格）处理。 */
import type MarkdownIt from 'markdown-it'
import {
  createParagraphElement,
  getBlockAncestor,
  isElementNode,
  normalizeText,
  placeCaretAtStart
} from './serialization'

export type Shortcut =
  | { type: 'heading'; level: number; content: string }
  | { type: 'quote'; content: string }
  | { type: 'bullet'; content: string }
  | { type: 'ordered'; content: string; start: number }
  | { type: 'code'; language: string }
  | { type: 'hr' }

export function parseShortcut(text: string): Shortcut | null {
  const headingMatch = text.match(/^(#{1,6})\s+(.+)$/)
  if (headingMatch) {
    return { type: 'heading', level: headingMatch[1].length, content: headingMatch[2] }
  }

  const quoteMatch = text.match(/^>\s+(.+)$/)
  if (quoteMatch) {
    return { type: 'quote', content: quoteMatch[1] }
  }

  const bulletMatch = text.match(/^[-*+]\s+(.+)$/)
  if (bulletMatch) {
    return { type: 'bullet', content: bulletMatch[1] }
  }

  const orderedMatch = text.match(/^(\d+)\.\s+(.+)$/)
  if (orderedMatch) {
    return { type: 'ordered', start: Number(orderedMatch[1]), content: orderedMatch[2] }
  }

  if (/^```\s*(\w*)$/.test(text)) {
    return { type: 'code', language: text.match(/^```\s*(\w*)$/)?.[1] ?? '' }
  }

  if (/^[-*]{3,}$/.test(text) || /^_{3,}$/.test(text)) {
    return { type: 'hr' }
  }

  return null
}

export function createShortcutBlock(md: MarkdownIt, shortcut: Shortcut): HTMLElement {
  switch (shortcut.type) {
    case 'heading': {
      const heading = document.createElement(`h${shortcut.level}`)
      heading.innerHTML = md.renderInline(shortcut.content)
      return heading
    }
    case 'quote': {
      const blockquote = document.createElement('blockquote')
      const paragraph = document.createElement('p')
      paragraph.innerHTML = md.renderInline(shortcut.content)
      blockquote.append(paragraph)
      return blockquote
    }
    case 'bullet': {
      const list = document.createElement('ul')
      const item = document.createElement('li')
      item.innerHTML = md.renderInline(shortcut.content)
      list.append(item)
      return list
    }
    case 'ordered': {
      const list = document.createElement('ol')
      if (shortcut.start > 1) {
        list.setAttribute('start', String(shortcut.start))
      }
      const item = document.createElement('li')
      item.innerHTML = md.renderInline(shortcut.content)
      list.append(item)
      return list
    }
    case 'code': {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      if (shortcut.language) {
        code.classList.add(`language-${shortcut.language}`)
      }
      code.append(document.createElement('br'))
      pre.append(code)
      return pre
    }
    case 'hr':
      return document.createElement('hr')
  }
}

export function getCurrentBlockElement(editor: HTMLDivElement | null): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection?.anchorNode || !editor) {
    return null
  }

  return getBlockAncestor(selection.anchorNode, editor)
    || editor.firstElementChild as HTMLElement | null
}

export function isInsideList(): { list: HTMLUListElement | HTMLOListElement; item: HTMLLIElement } | null {
  const selection = window.getSelection()
  if (!selection?.anchorNode) {
    return null
  }

  let node: Node | null = selection.anchorNode
  while (node) {
    if (isElementNode(node)) {
      const tag = node.tagName
      if (tag === 'LI' && node.parentElement && (node.parentElement.tagName === 'UL' || node.parentElement.tagName === 'OL')) {
        return { list: node.parentElement as HTMLUListElement | HTMLOListElement, item: node as HTMLLIElement }
      }
    }
    node = node.parentNode
  }

  return null
}

export function handleListEnter(listInfo: { list: HTMLUListElement | HTMLOListElement; item: HTMLLIElement }): boolean {
  const text = normalizeText(listInfo.item.textContent || '').trim()
  if (!text) {
    const paragraph = createParagraphElement()
    listInfo.list.insertAdjacentElement('afterend', paragraph)
    listInfo.list.removeChild(listInfo.item)
    if (listInfo.list.children.length === 0) {
      listInfo.list.replaceWith(paragraph)
    }
    placeCaretAtStart(paragraph)
    return true
  }

  return false
}

export interface ShortcutHandlerDeps {
  getEditor: () => HTMLDivElement | null
  getActiveBlock: () => HTMLElement | null
  setActiveBlock: (element: HTMLElement | null) => void
  isComposing: () => boolean
  isReadOnly: () => boolean
  emitMarkdown: () => void
  emitSaveShortcut: () => void
}

/**
 * 构造快捷键按下事件处理器。
 * 依赖通过 deps 注入，避免处理器直接耦合到 Vue 响应式状态与组件实例。
 */
export function createShortcutKeyHandler(md: MarkdownIt, deps: ShortcutHandlerDeps) {
  function handleBackspaceInHeading(event: KeyboardEvent): void {
    const editor = deps.getEditor()
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !selection.anchorNode || !editor) {
      return
    }

    const anchorNode = selection.anchorNode
    const block = getBlockAncestor(anchorNode, editor)
    if (!block) {
      return
    }

    const tag = block.tagName.toLowerCase()
    if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      return
    }

    try {
      const range = document.createRange()
      range.selectNodeContents(block)
      range.setEnd(anchorNode, selection.anchorOffset)
      if (range.toString().length > 0) {
        return
      }
    } catch {
      return
    }

    event.preventDefault()
    const text = normalizeText(block.textContent || '')
    const paragraph = text
      ? (() => { const p = document.createElement('p'); p.textContent = text; return p })()
      : createParagraphElement()
    block.replaceWith(paragraph)
    placeCaretAtStart(paragraph)
    deps.emitMarkdown()
  }

  function handleEditorKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      deps.emitSaveShortcut()
      return
    }

    if (event.key === 'Backspace' && !event.shiftKey && !deps.isComposing() && !deps.isReadOnly()) {
      handleBackspaceInHeading(event)
      if (event.defaultPrevented) {
        return
      }
    }

    if (event.key !== 'Enter' || event.shiftKey || deps.isComposing() || deps.isReadOnly()) {
      return
    }

    const listInfo = isInsideList()
    if (listInfo) {
      const handled = handleListEnter(listInfo)
      if (handled) {
        event.preventDefault()
        deps.emitMarkdown()
        return
      }
    }

    const editor = deps.getEditor()
    const block = getCurrentBlockElement(editor)
    if (!block || !editor) {
      return
    }

    const tag = block.tagName.toLowerCase()
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      event.preventDefault()
      const trimmed = normalizeText(block.textContent || '').trim()
      if (!trimmed) {
        const paragraph = createParagraphElement()
        block.replaceWith(paragraph)
        placeCaretAtStart(paragraph)
      } else {
        const paragraph = createParagraphElement()
        block.insertAdjacentElement('afterend', paragraph)
        placeCaretAtStart(paragraph)
      }
      deps.emitMarkdown()
      return
    }

    if (tag === 'pre') {
      return
    }

    const rawText = normalizeText(block.textContent || '').trim()
    const shortcut = parseShortcut(rawText)
    if (!shortcut) {
      return
    }

    event.preventDefault()

    if (deps.getActiveBlock() === block) {
      deps.setActiveBlock(null)
    }

    const replacement = createShortcutBlock(md, shortcut)
    block.replaceWith(replacement)

    const paragraph = createParagraphElement()
    replacement.insertAdjacentElement('afterend', paragraph)
    placeCaretAtStart(paragraph)
    deps.emitMarkdown()
  }

  return {
    handleEditorKeydown
  }
}
