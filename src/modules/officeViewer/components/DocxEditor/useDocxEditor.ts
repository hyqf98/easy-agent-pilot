/**
 * useDocxEditor — Docx 编辑器的全部业务逻辑。
 *
 * 职责：
 * 1. 提供两种视图模式：preview（docx-preview 渲染只读预览）/ edit（Univer Docs 富文本编辑）；
 * 2. preview 模式下调用 docx-preview 的 renderAsync 把缓冲渲染到容器；
 * 3. edit 模式下通过 useUniverEngine 初始化 Univer Docs，并用 mammoth 抽取 docx 段落，
 *    转换为 Univer Doc 数据结构（paragraphsToUniverDoc）后载入；
 * 4. 监听 props.buffer 变化自动重载，并在切换模式时正确销毁/重建引擎。
 *
 * 该 composable 不直接渲染模板，容器 ref 与对外暴露的 viewMode / switchMode 通过返回值交给模板。
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useUniverEngine } from '../../composables/useUniverEngine'

/** DocxEditor 视图模式：预览 / 编辑 */
export type ViewMode = 'preview' | 'edit'

/** DocxEditor 组件 Props */
export interface DocxEditorProps {
  buffer: Uint8Array | null
}

/** DocxEditor 组件 Emits */
export interface DocxEditorEmits {
  (e: 'loading', value: boolean): void
}

interface DocParagraph {
  text: string
}

export function useDocxEditor(
  props: DocxEditorProps,
  emit: DocxEditorEmits
) {
  const containerRef = ref<HTMLElement | null>(null)
  const engine = useUniverEngine()
  const viewMode = ref<ViewMode>('preview')
  const isSwitching = ref(false)

  let loadedBufferRef: Uint8Array | null = null

  const renderPreview = async () => {
    if (!containerRef.value || !props.buffer) return
    containerRef.value.innerHTML = ''
    try {
      const { renderAsync } = await import('docx-preview')
      await renderAsync(props.buffer, containerRef.value, undefined, {
        className: 'docx-preview-wrapper',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        experimental: false,
        trimXmlDeclaration: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      })
      console.log('[DocxEditor] preview rendered')
    } catch (error) {
      console.error('[DocxEditor] preview render failed:', error)
    }
  }

  const extractDocxParagraphs = async (buf: Uint8Array): Promise<DocParagraph[]> => {
    try {
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({ arrayBuffer: buf.buffer })
      const html = result.value
      const div = document.createElement('div')
      div.innerHTML = html
      const nodes = div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')
      const paragraphs: DocParagraph[] = []
      nodes.forEach((node) => {
        const text = node.textContent?.trim()
        if (text) {
          paragraphs.push({ text })
        }
      })
      console.log('[DocxEditor] extracted', paragraphs.length, 'paragraphs from html, total chars =', paragraphs.reduce((s, p) => s + p.text.length, 0))
      if (paragraphs.length > 0) {
        console.log('[DocxEditor] first 3 paragraphs:', paragraphs.slice(0, 3).map(p => p.text.substring(0, 50)))
      }
      return paragraphs
    } catch (error) {
      console.error('[DocxEditor] mammoth extract failed:', error)
      return []
    }
  }

  const paragraphsToUniverDoc = (paragraphs: DocParagraph[]) => {
    if (paragraphs.length === 0) {
      return {
        id: 'doc-editor',
        body: { dataStream: '\r\n' },
        documentStyle: {
          pageSize: { width: 794, height: 1123 },
          marginTop: 100,
          marginBottom: 100,
          marginLeft: 120,
          marginRight: 120,
          paragraphLineGapDefault: 0,
        },
      }
    }

    let dataStream = ''
    const paragraphsData: any[] = []
    const textRuns: any[] = []
    const sectionBreaks: any[] = []
    let offset = 0

    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].text
      const paraStartIndex = offset

      if (text.length > 0) {
        dataStream += text
        textRuns.push({
          st: offset,
          ed: offset + text.length,
          ts: {
            fs: 14,
            ff: 'Microsoft YaHei',
          },
        })
        offset += text.length
      }

      dataStream += '\r'
      paragraphsData.push({
        startIndex: paraStartIndex,
        paragraphStyle: {
          lineSpacing: 20,
          spacingRule: 2,
          spaceAbove: { v: 0 },
          spaceBelow: { v: 0 },
        },
      })
      offset += 1
    }

    dataStream += '\n'
    sectionBreaks.push({
      startIndex: offset,
      sectionType: 2,
    })

    return {
      id: 'doc-editor',
      body: {
        dataStream,
        paragraphs: paragraphsData,
        textRuns,
        sectionBreaks,
      },
      documentStyle: {
        pageSize: { width: 794, height: 1123 },
        marginTop: 100,
        marginBottom: 100,
        marginLeft: 120,
        marginRight: 120,
        paragraphLineGapDefault: 0,
      },
    }
  }

  const renderEdit = async () => {
    if (!containerRef.value) return
    containerRef.value.innerHTML = ''

    try {
      const api = await engine.init(containerRef.value, 'docs')

      if (props.buffer && props.buffer.length > 0) {
        const paragraphs = await extractDocxParagraphs(props.buffer)
        const docData = paragraphsToUniverDoc(paragraphs)
        console.log('[DocxEditor] dataStream length =', (docData as any).body?.dataStream?.length)
        console.log('[DocxEditor] paragraphs count =', (docData as any).body?.paragraphs?.length)
        api.createUniverDoc(docData)
      } else {
        api.createUniverDoc({
          id: 'doc-editor',
          body: { dataStream: '\r\n' },
          documentStyle: {
            pageSize: { width: 794, height: 1123 },
            marginTop: 100,
            marginBottom: 100,
            marginLeft: 120,
            marginRight: 120,
            paragraphLineGapDefault: 0,
          },
        })
      }
      console.log('[DocxEditor] edit mode loaded')
    } catch (error) {
      console.error('[DocxEditor] edit load failed:', error)
    }
  }

  const loadDoc = async () => {
    if (!containerRef.value) return
    emit('loading', true)
    try {
      loadedBufferRef = props.buffer
      if (viewMode.value === 'preview') {
        await renderPreview()
      } else {
        await renderEdit()
      }
    } finally {
      emit('loading', false)
    }
  }

  const switchMode = async (mode: ViewMode) => {
    if (mode === viewMode.value || isSwitching.value) return
    isSwitching.value = true
    viewMode.value = mode

    if (mode === 'preview') {
      engine.dispose()
    }

    await nextTick()
    await loadDoc()
    isSwitching.value = false
  }

  watch(() => props.buffer, (newBuffer) => {
    if (newBuffer !== loadedBufferRef) {
      if (viewMode.value === 'edit') {
        engine.dispose()
      }
      loadDoc()
    }
  })

  onMounted(loadDoc)

  onBeforeUnmount(() => {
    engine.dispose()
  })

  return {
    containerRef,
    viewMode,
    switchMode
  }
}
