<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  readOnly?: boolean
}>(), {
  placeholder: '',
  readOnly: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'save-shortcut': []
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const lastEmittedMarkdown = ref(props.modelValue)
const isComposing = ref(false)
const activeBlockRef = ref<HTMLElement | null>(null)
let isUpdatingDom = false

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
})

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ')
}

function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE
}

function escapeInlineText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]~])/g, '\\$1')
}

function renderMarkdownToHtml(markdown: string): string {
  const trimmed = markdown.trim()
  return trimmed ? md.render(trimmed) : '<p><br></p>'
}

function createParagraphElement(): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.append(document.createElement('br'))
  return paragraph
}

function updateEmptyState(): void {
  if (!editorRef.value) {
    return
  }

  const isEmpty = serializeEditor(editorRef.value).trim().length === 0
  editorRef.value.dataset.empty = String(isEmpty)
}

function renderEditor(markdown: string): void {
  if (!editorRef.value) {
    return
  }

  activeBlockRef.value = null
  editorRef.value.innerHTML = renderMarkdownToHtml(markdown)
  if (!editorRef.value.firstElementChild) {
    editorRef.value.append(createParagraphElement())
  }
  updateEmptyState()
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeInlineText(normalizeText(node.textContent || ''))
  }
  if (!isElementNode(node)) {
    return ''
  }

  const tag = node.tagName.toLowerCase()
  const content = Array.from(node.childNodes).map(serializeInline).join('')
  switch (tag) {
    case 'strong':
    case 'b':
      return `**${content}**`
    case 'em':
    case 'i':
      return `*${content}*`
    case 'del':
    case 's':
      return `~~${content}~~`
    case 'code':
      return `\`${normalizeText(node.textContent || '')}\``
    case 'a': {
      const href = node.getAttribute('href') || ''
      const text = content || normalizeText(node.textContent || href)
      return href ? `[${text}](${href})` : text
    }
    case 'br':
      return '\n'
    case 'img': {
      const alt = node.getAttribute('alt') || ''
      const src = node.getAttribute('src') || ''
      return src ? `![${alt}](${src})` : ''
    }
    default:
      return content
  }
}

function serializeParagraph(element: HTMLElement): string {
  return Array.from(element.childNodes).map(serializeInline).join('').trim()
}

function serializeBlockquote(element: HTMLElement): string {
  const content = Array.from(element.childNodes)
    .map(serializeBlock)
    .filter(Boolean)
    .join('\n\n')

  if (!content.trim()) {
    return '>'
  }

  return content
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')
}

function serializeListItem(element: HTMLLIElement, marker: string): string {
  const nestedLists = Array.from(element.children).filter(child => ['UL', 'OL'].includes(child.tagName))
  const directNodes = Array.from(element.childNodes).filter(node => {
    return !(isElementNode(node) && ['UL', 'OL'].includes(node.tagName))
  })
  const content = directNodes.map(serializeInline).join('').trim()
  const lines = [`${marker}${content}`.trimEnd()]

  nestedLists.forEach((list) => {
    const serialized = serializeBlock(list)
    if (serialized) {
      lines.push(serialized)
    }
  })

  return lines.join('\n')
}

function serializeList(element: HTMLOListElement | HTMLUListElement): string {
  const ordered = element.tagName.toLowerCase() === 'ol'
  const start = ordered ? Number(element.getAttribute('start') || '1') : 1
  return Array.from(element.children)
    .filter((child): child is HTMLLIElement => child.tagName === 'LI')
    .map((item, index) => serializeListItem(item, ordered ? `${start + index}. ` : '- '))
    .join('\n')
}

function serializeTable(element: HTMLTableElement): string {
  const rows = Array.from(element.querySelectorAll('tr'))
  if (!rows.length) {
    return ''
  }

  const serializedRows = rows.map(row => (
    Array.from(row.children)
      .map(cell => normalizeText(cell.textContent || '').replace(/\|/g, '\\|').trim())
  ))

  const lines = serializedRows.map(cells => `| ${cells.join(' | ')} |`)
  const headerCells = serializedRows[0]?.length ?? 0
  if (headerCells > 0) {
    lines.splice(1, 0, `| ${Array.from({ length: headerCells }, () => '---').join(' | ')} |`)
  }

  return lines.join('\n')
}

function serializePre(element: HTMLElement): string {
  const code = element.querySelector('code')
  const languageClass = Array.from(code?.classList || []).find(value => value.startsWith('language-'))
  const language = languageClass ? languageClass.replace('language-', '') : ''
  const content = normalizeText(code?.textContent || element.textContent || '').replace(/\n$/, '')
  return `\`\`\`${language}\n${content}\n\`\`\``
}

function serializeBlock(node: Node): string {
  if (!isElementNode(node)) {
    return normalizeText(node.textContent || '').trim()
  }

  const element = node as HTMLElement
  if (element.dataset?.raw === 'true') {
    return normalizeText(element.textContent || '')
  }

  const tag = element.tagName.toLowerCase()
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag.slice(1))
      const content = Array.from(element.childNodes).map(serializeInline).join('').trim()
      return `${'#'.repeat(level)} ${content}`.trimEnd()
    }
    case 'p':
    case 'div':
      return serializeParagraph(element)
    case 'blockquote':
      return serializeBlockquote(element)
    case 'ul':
    case 'ol':
      return serializeList(element as HTMLOListElement | HTMLUListElement)
    case 'pre':
      return serializePre(element)
    case 'table':
      return serializeTable(element as HTMLTableElement)
    case 'hr':
      return '---'
    default:
      return serializeParagraph(element)
  }
}

function serializeEditor(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map(serializeBlock)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function emitCurrentMarkdown(): void {
  if (!editorRef.value) {
    return
  }

  const markdown = serializeEditor(editorRef.value)
  lastEmittedMarkdown.value = markdown
  emit('update:modelValue', markdown)
  updateEmptyState()
}

function getBlockAncestor(node: Node, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (isElementNode(current) && current.parentElement === root) {
      return current
    }
    current = current.parentNode
  }
  return null
}

function getCurrentBlockElement(): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection?.anchorNode || !editorRef.value) {
    return null
  }

  return getBlockAncestor(selection.anchorNode, editorRef.value)
    || editorRef.value.firstElementChild as HTMLElement | null
}

function placeCaretAtStart(element: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) {
    return
  }

  const target = element.firstChild || element
  const range = document.createRange()
  if (target.nodeType === Node.TEXT_NODE) {
    range.setStart(target, 0)
  } else {
    range.selectNodeContents(element)
    range.collapse(true)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}

type Shortcut =
  | { type: 'heading'; level: number; content: string }
  | { type: 'quote'; content: string }
  | { type: 'bullet'; content: string }
  | { type: 'ordered'; content: string; start: number }
  | { type: 'code'; language: string }
  | { type: 'hr' }

function parseShortcut(text: string): Shortcut | null {
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

function createShortcutBlock(shortcut: Shortcut): HTMLElement {
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

function isInsideList(): { list: HTMLUListElement | HTMLOListElement; item: HTMLLIElement } | null {
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

function handleListEnter(listInfo: { list: HTMLUListElement | HTMLOListElement; item: HTMLLIElement }): boolean {
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

function handleDocumentSelectionChange(): void {
  if (isUpdatingDom || isComposing.value || props.readOnly || !editorRef.value) {
    return
  }

  const selection = window.getSelection()
  if (!selection?.anchorNode) {
    return
  }

  let node: Node | null = selection.anchorNode
  let insideEditor = false
  while (node) {
    if (node === editorRef.value) {
      insideEditor = true
      break
    }
    node = node.parentNode
  }

  if (!insideEditor) {
    return
  }

  const nextBlock = getBlockAncestor(selection.anchorNode, editorRef.value)
  if (nextBlock) {
    activeBlockRef.value = nextBlock
  }
}

function handleEditorFocusOut(_event: FocusEvent): void {
  activeBlockRef.value = null
}

function handleEditorInput(): void {
  emitCurrentMarkdown()
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    emit('save-shortcut')
    return
  }

  if (event.key === 'Backspace' && !event.shiftKey && !isComposing.value && !props.readOnly) {
    handleBackspaceInHeading(event)
    if (event.defaultPrevented) {
      return
    }
  }

  if (event.key !== 'Enter' || event.shiftKey || isComposing.value || props.readOnly) {
    return
  }

  const listInfo = isInsideList()
  if (listInfo) {
    const handled = handleListEnter(listInfo)
    if (handled) {
      event.preventDefault()
      emitCurrentMarkdown()
      return
    }
  }

  const block = getCurrentBlockElement()
  if (!block || !editorRef.value) {
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
    emitCurrentMarkdown()
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

  if (activeBlockRef.value === block) {
    activeBlockRef.value = null
  }

  const replacement = createShortcutBlock(shortcut)
  block.replaceWith(replacement)

  const paragraph = createParagraphElement()
  replacement.insertAdjacentElement('afterend', paragraph)
  placeCaretAtStart(paragraph)
  emitCurrentMarkdown()
}

function handleBackspaceInHeading(event: KeyboardEvent): void {
  const selection = window.getSelection()
  if (!selection?.isCollapsed || !selection.anchorNode || !editorRef.value) {
    return
  }

  const anchorNode = selection.anchorNode
  const block = getBlockAncestor(anchorNode, editorRef.value)
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
  emitCurrentMarkdown()
}

function handleEditorPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain')
  if (!text || !editorRef.value || props.readOnly) {
    return
  }

  event.preventDefault()
  document.execCommand('insertHTML', false, md.render(text.trim()))
  emitCurrentMarkdown()
}

function handleCompositionStart(): void {
  isComposing.value = true
}

function handleCompositionEnd(): void {
  isComposing.value = false
}

watch(
  () => props.modelValue,
  async (value) => {
    if (value === lastEmittedMarkdown.value) {
      return
    }

    activeBlockRef.value = null
    await nextTick()
    renderEditor(value)
    lastEmittedMarkdown.value = value
  }
)

onMounted(() => {
  renderEditor(props.modelValue)
  lastEmittedMarkdown.value = props.modelValue
  document.addEventListener('selectionchange', handleDocumentSelectionChange)
})

onUnmounted(() => {
  isComposing.value = false
  document.removeEventListener('selectionchange', handleDocumentSelectionChange)
})
</script>

<template>
  <div class="rich-markdown-editor-shell">
    <div
      ref="editorRef"
      class="rich-markdown-editor"
      :contenteditable="!readOnly"
      spellcheck="false"
      :data-placeholder="placeholder"
      :data-readonly="String(readOnly)"
      @input="handleEditorInput"
      @keydown="handleEditorKeydown"
      @paste="handleEditorPaste"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @focusout="handleEditorFocusOut"
    />
  </div>
</template>
<style scoped src="./RichMarkdownEditor.css"></style>
