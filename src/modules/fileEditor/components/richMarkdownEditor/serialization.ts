/** Rich Markdown Editor 的 DOM ↔ Markdown 序列化引擎与纯 DOM 工具集。 */
import type MarkdownIt from 'markdown-it'

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ')
}

export function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE
}

export function escapeInlineText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]~])/g, '\\$1')
}

export function renderMarkdownToHtml(md: MarkdownIt, markdown: string): string {
  const trimmed = markdown.trim()
  return trimmed ? md.render(trimmed) : '<p><br></p>'
}

export function createParagraphElement(): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.append(document.createElement('br'))
  return paragraph
}

export function getBlockAncestor(node: Node, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (isElementNode(current) && current.parentElement === root) {
      return current
    }
    current = current.parentNode
  }
  return null
}

export function placeCaretAtStart(element: HTMLElement): void {
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

export function serializeInline(node: Node): string {
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

export function serializeParagraph(element: HTMLElement): string {
  return Array.from(element.childNodes).map(serializeInline).join('').trim()
}

export function serializeBlockquote(element: HTMLElement): string {
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

export function serializeListItem(element: HTMLLIElement, marker: string): string {
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

export function serializeList(element: HTMLOListElement | HTMLUListElement): string {
  const ordered = element.tagName.toLowerCase() === 'ol'
  const start = ordered ? Number(element.getAttribute('start') || '1') : 1
  return Array.from(element.children)
    .filter((child): child is HTMLLIElement => child.tagName === 'LI')
    .map((item, index) => serializeListItem(item, ordered ? `${start + index}. ` : '- '))
    .join('\n')
}

export function serializeTable(element: HTMLTableElement): string {
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

export function serializePre(element: HTMLElement): string {
  const code = element.querySelector('code')
  const languageClass = Array.from(code?.classList || []).find(value => value.startsWith('language-'))
  const language = languageClass ? languageClass.replace('language-', '') : ''
  const content = normalizeText(code?.textContent || element.textContent || '').replace(/\n$/, '')
  return `\`\`\`${language}\n${content}\n\`\`\``
}

export function serializeBlock(node: Node): string {
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

export function serializeEditor(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map(serializeBlock)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
