/** Rich Markdown Editor 状态机：编排 contenteditable 生命周期、外部值同步与事件入口。 */
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  createParagraphElement,
  getBlockAncestor,
  renderMarkdownToHtml,
  serializeEditor
} from './serialization'
import { createShortcutKeyHandler } from './shortcuts'
import type { RichMarkdownEditorEmits, RichMarkdownEditorProps } from './types'
export type { RichMarkdownEditorEmits, RichMarkdownEditorProps } from './types'

/**
 * 富文本 Markdown 编辑器状态机。
 * 负责响应式状态、contenteditable DOM 渲染/序列化与外部值双向同步，并将键入行为委托给快捷键处理器。
 */
export function useRichMarkdownEditor(
  props: Readonly<RichMarkdownEditorProps>,
  emit: RichMarkdownEditorEmits
) {
  const editorRef = ref<HTMLDivElement | null>(null)
  const lastEmittedMarkdown = ref(props.modelValue)
  const isComposing = ref(false)
  const activeBlockRef = ref<HTMLElement | null>(null)
  const isUpdatingDom = false

  const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true
  })

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
    editorRef.value.innerHTML = renderMarkdownToHtml(md, markdown)
    if (!editorRef.value.firstElementChild) {
      editorRef.value.append(createParagraphElement())
    }
    updateEmptyState()
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

  const { handleEditorKeydown } = createShortcutKeyHandler(md, {
    getEditor: () => editorRef.value,
    getActiveBlock: () => activeBlockRef.value,
    setActiveBlock: (element) => { activeBlockRef.value = element },
    isComposing: () => isComposing.value,
    isReadOnly: () => props.readOnly ?? false,
    emitMarkdown: emitCurrentMarkdown,
    emitSaveShortcut: () => emit('save-shortcut')
  })

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

  return {
    editorRef,
    handleEditorInput,
    handleEditorKeydown,
    handleEditorPaste,
    handleCompositionStart,
    handleCompositionEnd,
    handleEditorFocusOut
  }
}
