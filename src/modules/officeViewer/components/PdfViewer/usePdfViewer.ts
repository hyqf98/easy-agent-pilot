/**
 * usePdfViewer — PDF 预览器的全部业务逻辑。
 *
 * 职责：
 * 1. 动态 import pdfjs-dist 并配置 worker；
 * 2. 把 Uint8Array 缓冲加载为 PDFDocumentProxy，渲染侧边栏缩略图列表（renderAllThumbnails）；
 * 3. 渲染主预览区当前页（renderMainPage），支持自适应容器尺寸与缩放（zoomIn / zoomOut）；
 * 4. 监听 props.buffer / 当前页码 / 缩放比例变化自动重渲染，并在切换页码时滚动到对应缩略图。
 *
 * 该 composable 不直接渲染模板，sidebarRef / contentAreaRef 通过返回值暴露给模板使用。
 *
 * 说明：本文件取代了历史上已废弃（全项目无人引用）的 composables/usePdfViewer.ts。
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

/** PdfViewer 组件 Props */
export interface PdfViewerProps {
  buffer: Uint8Array | null
}

/** PdfViewer 组件 Emits */
export interface PdfViewerEmits {
  (e: 'loading', value: boolean): void
}

export function usePdfViewer(
  props: PdfViewerProps,
  emit: PdfViewerEmits
) {
  const sidebarRef = ref<HTMLElement | null>(null)
  const contentAreaRef = ref<HTMLElement | null>(null)
  const thumbnailRefs = ref<Map<number, HTMLElement>>(new Map())

  const currentPage = ref(1)
  const totalPages = ref(0)
  const scale = ref(1)
  let pdfDocProxy: any = null
  let pdfjsLibRef: any = null

  const zoomIn = () => {
    scale.value = Math.min(scale.value + 0.25, 3)
  }

  const zoomOut = () => {
    scale.value = Math.max(scale.value - 0.25, 0.5)
  }

  const loadPdfJs = async () => {
    if (pdfjsLibRef) return pdfjsLibRef
    const lib = await import('pdfjs-dist')
    lib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    pdfjsLibRef = lib
    return lib
  }

  const renderPageToCanvas = async (
    page: any,
    canvas: HTMLCanvasElement,
    renderScale: number,
  ) => {
    const viewport = page.getViewport({ scale: renderScale })
    const outputScale = window.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const context = canvas.getContext('2d')
    if (!context) return

    const transform =
      outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined

    await (page.render as any)({
      canvasContext: context,
      viewport,
      transform,
    }).promise
  }

  const loadPdf = async () => {
    if (!props.buffer) return

    emit('loading', true)
    try {
      const lib = await loadPdfJs()
      const loadingTask = lib.getDocument({ data: props.buffer })
      pdfDocProxy = await loadingTask.promise
      totalPages.value = pdfDocProxy.numPages
      currentPage.value = 1
      scale.value = 1

      await nextTick()
      await renderAllThumbnails()
      await renderMainPage()
      scrollToCurrentPage()
    } catch (error) {
      console.error('Failed to load PDF:', error)
    } finally {
      emit('loading', false)
    }
  }

  const renderAllThumbnails = async () => {
    if (!pdfDocProxy || !sidebarRef.value) return

    sidebarRef.value.innerHTML = ''
    thumbnailRefs.value.clear()

    const thumbW = 140
    for (let i = 1; i <= totalPages.value; i++) {
      try {
        const page = await pdfDocProxy.getPage(i)
        const viewport = page.getViewport({ scale: 1 })
        const ratio = viewport.height / viewport.width
        const thumbH = Math.round(thumbW * ratio)
        const actualScale = thumbW / viewport.width

        const thumbItem = document.createElement('div')
        thumbItem.className = 'pdf-thumb-item'
        thumbItem.dataset.page = String(i)
        if (i === currentPage.value) {
          thumbItem.classList.add('pdf-thumb-item--active')
        }

        const labelWrap = document.createElement('div')
        labelWrap.className = 'pdf-thumb-label-wrap'

        const canvas = document.createElement('canvas')
        canvas.style.width = `${thumbW}px`
        canvas.style.height = `${thumbH}px`
        canvas.className = 'pdf-thumb-canvas'
        labelWrap.appendChild(canvas)

        const label = document.createElement('span')
        label.className = 'pdf-thumb-label'
        label.textContent = String(i)
        labelWrap.appendChild(label)

        thumbItem.appendChild(labelWrap)
        sidebarRef.value.appendChild(thumbItem)
        thumbnailRefs.value.set(i, thumbItem)

        const pageNum = i
        thumbItem.addEventListener('click', () => {
          goToPage(pageNum)
        })

        await renderPageToCanvas(page, canvas, actualScale)
      } catch (e) {
        console.error(`Failed to render thumbnail page ${i}:`, e)
      }
    }
  }

  const renderMainPage = async () => {
    if (!pdfDocProxy || !contentAreaRef.value) return

    const containerW = contentAreaRef.value.clientWidth - 64
    const containerH = contentAreaRef.value.clientHeight - 64
    if (containerW <= 0 || containerH <= 0) return

    try {
      const page = await pdfDocProxy.getPage(currentPage.value)
      const viewport = page.getViewport({ scale: 1 })

      const fitScaleW = containerW / viewport.width
      const fitScaleH = containerH / viewport.height
      const fitScale = Math.min(fitScaleW, fitScaleH)
      const finalScale = Math.min(fitScale, 2) * scale.value

      const existingCanvas = contentAreaRef.value.querySelector('canvas')
      const canvas = existingCanvas || document.createElement('canvas')

      if (!existingCanvas) {
        const wrapper = document.createElement('div')
        wrapper.className = 'pdf-main-page-wrapper'
        wrapper.appendChild(canvas)
        contentAreaRef.value.innerHTML = ''
        contentAreaRef.value.appendChild(wrapper)
      }

      await renderPageToCanvas(page, canvas, finalScale)
    } catch (e) {
      console.error(`Failed to render main page ${currentPage.value}:`, e)
    }
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages.value && page !== currentPage.value) {
      currentPage.value = page
    }
  }

  const scrollToCurrentPage = () => {
    const thumbEl = thumbnailRefs.value.get(currentPage.value)
    if (thumbEl && sidebarRef.value) {
      thumbEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  const updateActiveThumbnail = () => {
    thumbnailRefs.value.forEach((el, pageNum) => {
      if (pageNum === currentPage.value) {
        el.classList.add('pdf-thumb-item--active')
      } else {
        el.classList.remove('pdf-thumb-item--active')
      }
    })
  }

  watch(() => props.buffer, loadPdf)

  watch(currentPage, async () => {
    updateActiveThumbnail()
    scrollToCurrentPage()
    await renderMainPage()
  })

  watch(scale, async () => {
    await renderMainPage()
  })

  onMounted(loadPdf)

  onBeforeUnmount(() => {
    pdfDocProxy?.destroy()
    pdfDocProxy = null
  })

  return {
    sidebarRef,
    contentAreaRef,
    currentPage,
    totalPages,
    scale,
    zoomIn,
    zoomOut
  }
}
