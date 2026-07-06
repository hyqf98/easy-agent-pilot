/** useMarkdownRenderer — MarkdownRenderer 组件的 composable，装配 markdown-it + highlight.js + mermaid 并处理代码块与链接交互。 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import mermaid from 'mermaid'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useProjectStore } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
import { useNotificationStore } from '@/stores/notification'
import { useRightFilePanelStore } from '@/stores/rightFilePanel'
import { useThemeStore } from '@/stores/theme'
import { openProjectFileInWorkspace } from '@/modules/fileEditor'

export interface MarkdownRendererProps {
  content: string
  animate?: boolean
}

export function useMarkdownRenderer(props: MarkdownRendererProps) {
  const containerRef = ref<HTMLDivElement | null>(null)
  const projectStore = useProjectStore()
  const uiStore = useUIStore()
  const notificationStore = useNotificationStore()
  const rightFilePanelStore = useRightFilePanelStore()
  const themeStore = useThemeStore()

  // 存储代码块原始内容，用于复制功能
  const codeBlockContents = ref(new Map<string, string>())
  const codeBlockCounter = ref(0)

  const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/
  const EXTERNAL_URL_SCHEME = /^(https?|mailto|tel):/i
  const GENERIC_URL_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/

  function trimCodeFencePadding(value: string): string {
    const lines = value.replace(/\r\n/g, '\n').split('\n')

    while (lines.length > 0 && lines[0].trim().length === 0) {
      lines.shift()
    }

    while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
      lines.pop()
    }

    return lines.join('\n')
  }

  function safeDecodeUriComponent(value: string): string {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  function normalizePath(value: string): string {
    return value.replace(/\\/g, '/').replace(/\/+/g, '/')
  }

  function trimTrailingSlash(value: string): string {
    return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
  }

  function normalizeComparablePath(value: string): string {
    return trimTrailingSlash(normalizePath(value)).toLowerCase()
  }

  function stripFileProtocol(value: string): string {
    if (!value.toLowerCase().startsWith('file://')) {
      return value
    }

    const withoutProtocol = value.slice('file://'.length)
    if (!withoutProtocol.startsWith('/')) {
      return withoutProtocol
    }

    const windowsStylePath = withoutProtocol.slice(1)
    if (WINDOWS_ABSOLUTE_PATH.test(windowsStylePath)) {
      return windowsStylePath
    }

    return withoutProtocol
  }

  function stripLineSuffix(value: string): string {
    return value.replace(/:(\d+)(?::(\d+))?$/, '')
  }

  function normalizeFileLinkPath(href: string): string {
    const decodedHref = safeDecodeUriComponent(href).trim()
    const withoutHash = decodedHref.replace(/[?#].*$/, '')
    const withoutFileProtocol = stripFileProtocol(withoutHash)
    return stripLineSuffix(withoutFileProtocol)
  }

  // markdown-it linkify 会把 AI 写的裸文件名（如 main.py、README.md）误判成 URL
  // （http://main.py）。这里识别这类伪 URL：host 段其实是带文件扩展名的文件名。
  const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9]{1,8}$/

  function extractFilenameFromPseudoUrl(href: string): string | null {
    const match = /^(?:https?:)?\/\/([^/?#]+)/i.exec(href)
    if (!match) return null
    const host = match[1]
    // 仅当 host 形如「文件名.扩展名」且无端口/路径/子域点时才视为文件名
    if (/[:/?]/.test(host)) return null
    if (host.split('.').length !== 2) return null
    return FILE_EXTENSION_PATTERN.test(host) ? host : null
  }

  function isLikelyLocalFileHref(href: string): boolean {
    const normalizedHref = normalizeFileLinkPath(href)
    if (!normalizedHref || normalizedHref.startsWith('#') || normalizedHref.startsWith('//')) {
      return false
    }

    // linkify 误判的伪 URL（http://main.py）：按文件处理
    if (EXTERNAL_URL_SCHEME.test(normalizedHref)) {
      return extractFilenameFromPseudoUrl(href) !== null
    }

    if (href.toLowerCase().startsWith('file://')) {
      return true
    }

    return WINDOWS_ABSOLUTE_PATH.test(normalizedHref)
      || normalizedHref.startsWith('/')
      || !GENERIC_URL_SCHEME.test(normalizedHref)
  }

  function joinProjectPath(projectPath: string, relativePath: string): string {
    return normalizePath(`${trimTrailingSlash(projectPath)}/${relativePath.replace(/^\.?\//, '')}`)
  }

  function resolveProjectFileTarget(href: string): {
    projectId: string
    projectPath: string
    filePath: string
  } | null {
    const normalizedHref = normalizeFileLinkPath(href)
    if (!normalizedHref) {
      return null
    }

    // linkify 伪 URL（http://main.py）：还原为裸文件名，在当前项目内解析
    const pseudoFilename = extractFilenameFromPseudoUrl(href)
    const effectiveHref = pseudoFilename ?? normalizedHref

    const sortedProjects = [...projectStore.projects]
      .sort((left, right) => normalizeComparablePath(right.path).length - normalizeComparablePath(left.path).length)

    if (WINDOWS_ABSOLUTE_PATH.test(effectiveHref) || effectiveHref.startsWith('/')) {
      const normalizedTarget = normalizeComparablePath(effectiveHref)
      const matchedProject = sortedProjects.find((project) => {
        const normalizedProjectPath = normalizeComparablePath(project.path)
        return normalizedTarget === normalizedProjectPath || normalizedTarget.startsWith(`${normalizedProjectPath}/`)
      })

      if (!matchedProject) {
        return null
      }

      return {
        projectId: matchedProject.id,
        projectPath: matchedProject.path,
        filePath: effectiveHref
      }
    }

    const currentProject = projectStore.currentProject
    if (!currentProject) {
      return null
    }

    return {
      projectId: currentProject.id,
      projectPath: currentProject.path,
      filePath: joinProjectPath(currentProject.path, effectiveHref)
    }
  }

  function appendTokenClass(
    tokens: Array<{
      attrIndex: (name: string) => number
      attrPush: (attrData: [string, string]) => void
      attrs?: [string, string][] | null
    }>,
    idx: number,
    className: string
  ): void {
    const classIndex = tokens[idx].attrIndex('class')
    if (classIndex < 0) {
      tokens[idx].attrPush(['class', className])
      return
    }

    if (tokens[idx].attrs) {
      tokens[idx].attrs[classIndex][1] = `${tokens[idx].attrs[classIndex][1]} ${className}`.trim()
    }
  }

  // 创建 MarkdownIt 实例
  const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true
  })

  // 覆盖 fence 渲染规则，生成自定义代码块 HTML
  // 不能用 highlight 选项，因为它返回的字符串会被包在 <pre><code> 里，导致非法嵌套
  md.renderer.rules.fence = (tokens, idx): string => {
    const token = tokens[idx]
    const lang = (token.info || '').trim()
    const rawCode = token.content || ''
    const normalizedCode = trimCodeFencePadding(rawCode)

    // mermaid 图表：输出占位容器，由渲染后处理（renderMermaidDiagrams）转为 SVG
    if (lang === 'mermaid') {
      const diagramId = `mermaid-${codeBlockCounter.value++}`
      // 仍登记原始内容，便于复制按钮获取源码
      codeBlockContents.value.set(diagramId, normalizedCode)
      // data-mermaid-src 保留原始语法，data-processed 标记是否已渲染
      return `<div class="mermaid-block" data-code-id="${diagramId}">
      <div class="code-block-header">
        <span class="code-block-language">mermaid</span>
        <button class="code-block-copy-btn" data-code-id="${diagramId}" title="复制源码">
          <svg class="copy-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
      <div class="mermaid" data-mermaid-src="${md.utils.escapeHtml(normalizedCode)}"></div>
    </div>`
    }

    // 生成唯一 ID 并存储原始代码
    const blockId = `code-block-${codeBlockCounter.value++}`
    codeBlockContents.value.set(blockId, normalizedCode)

    // 确定语言标签
    let languageLabel = lang || 'text'
    let highlightedCode: string

    if (lang && hljs.getLanguage(lang)) {
      try {
        highlightedCode = hljs.highlight(normalizedCode, { language: lang, ignoreIllegals: true }).value
      } catch {
        highlightedCode = md.utils.escapeHtml(normalizedCode)
      }
    } else {
      try {
        const result = hljs.highlightAuto(normalizedCode)
        highlightedCode = result.value
        if (result.language) {
          languageLabel = result.language
        }
      } catch {
        highlightedCode = md.utils.escapeHtml(normalizedCode)
      }
    }

    return `<div class="code-block-wrapper" data-code-id="${blockId}">
    <div class="code-block-header">
      <span class="code-block-language">${languageLabel}</span>
      <button class="code-block-copy-btn" data-code-id="${blockId}" title="复制代码">
        <svg class="copy-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
    </div>
    <pre class="hljs"><code>${highlightedCode}</code></pre>
  </div>`
  }

  // 自定义链接渲染，使用 Tauri opener 在外部浏览器打开
  const defaultLinkOpenRender = md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

  md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
    const href = tokens[idx].attrGet('href') ?? ''
    const linkKind = isLikelyLocalFileHref(href) ? 'file' : 'external'

    const kindIndex = tokens[idx].attrIndex('data-link-kind')
    if (kindIndex < 0) {
      tokens[idx].attrPush(['data-link-kind', linkKind])
    } else if (tokens[idx].attrs) {
      tokens[idx].attrs[kindIndex][1] = linkKind
    }

    appendTokenClass(tokens, idx, 'markdown-link')
    appendTokenClass(tokens, idx, linkKind === 'file' ? 'file-link' : 'external-link')

    if (linkKind === 'external') {
      const aIndex = tokens[idx].attrIndex('target')
      if (aIndex < 0) {
        tokens[idx].attrPush(['target', '_blank'])
      } else if (tokens[idx].attrs) {
        tokens[idx].attrs[aIndex][1] = '_blank'
      }

      const relIndex = tokens[idx].attrIndex('rel')
      if (relIndex < 0) {
        tokens[idx].attrPush(['rel', 'noopener noreferrer'])
      } else if (tokens[idx].attrs) {
        tokens[idx].attrs[relIndex][1] = 'noopener noreferrer'
      }
    }

    return defaultLinkOpenRender(tokens, idx, options, env, self)
  }

  const displayedText = computed(() => props.content)

  const renderedContent = computed(() => md.render(displayedText.value))

  // 处理链接点击，使用 Tauri opener
  const handleLinkClick = async (e: MouseEvent): Promise<void> => {
    const target = e.target as HTMLElement
    const link = target.closest('a.markdown-link') as HTMLAnchorElement | null

    if (link) {
      e.preventDefault()
      const href = link.getAttribute('href')
      if (href) {
        if (link.dataset.linkKind === 'file') {
          const fileTarget = resolveProjectFileTarget(href)
          if (!fileTarget) {
            // linkify 伪 URL 文件名（http://main.py）：无项目时仍尝试用裸文件名打开预览，
            // 由 openProjectFileInWorkspace / 编辑器展示「文件不存在」，绝不掉到浏览器
            const pseudoFilename = extractFilenameFromPseudoUrl(href)
            if (pseudoFilename) {
              const currentProject = projectStore.currentProject
              if (currentProject) {
                projectStore.setCurrentProject(currentProject.id)
                uiStore.setAppMode('chat')
                rightFilePanelStore.openForProject(currentProject.id)
                await openProjectFileInWorkspace({
                  projectId: currentProject.id,
                  projectPath: currentProject.path,
                  filePath: joinProjectPath(currentProject.path, pseudoFilename)
                })
              } else {
                notificationStore.warning('无法打开文件', '当前路径未匹配到已导入项目，请确认项目已导入。')
              }
              return
            }
            // 真正像域名（host.tld 且扩展名不是文件扩展名）时回退浏览器，避免误报
            if (/^[^\s/]+\.[A-Za-z]{2,}([/?#]|$)/i.test(href) && !FILE_EXTENSION_PATTERN.test(href)) {
              try {
                await openUrl(href.startsWith('http') ? href : `https://${href}`)
              } catch (error) {
                console.error('Failed to open URL:', error)
                window.open(href, '_blank', 'noopener,noreferrer')
              }
              return
            }
            notificationStore.warning('无法打开文件', '当前路径未匹配到已导入项目，请确认项目已导入。')
            return
          }

          projectStore.setCurrentProject(fileTarget.projectId)
          uiStore.setAppMode('chat')
          // 打开右侧文件面板，确保点击 AI 给出的文件名时面板可见
          rightFilePanelStore.openForProject(fileTarget.projectId)

          await openProjectFileInWorkspace(fileTarget)
          return
        }

        try {
          await openUrl(href)
        } catch (error) {
          console.error('Failed to open URL:', error)
          // 回退到默认行为
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
    }
  }

  // 处理复制按钮点击
  const handleCopyClick = async (e: MouseEvent): Promise<void> => {
    const target = e.target as HTMLElement
    const copyBtn = target.closest('.code-block-copy-btn') as HTMLButtonElement | null

    if (copyBtn) {
      e.preventDefault()
      const codeId = copyBtn.dataset.codeId
      if (codeId) {
        const codeContent = codeBlockContents.value.get(codeId)
        if (codeContent) {
          try {
            await navigator.clipboard.writeText(codeContent)
            // 显示复制成功反馈
            copyBtn.classList.add('copied')
            setTimeout(() => {
              copyBtn.classList.remove('copied')
            }, 2000)
          } catch (error) {
            console.error('Failed to copy code:', error)
          }
        }
      }
    }
  }

  // 处理点击事件（链接和复制按钮）
  const handleClick = async (e: MouseEvent): Promise<void> => {
    await handleLinkClick(e)
    await handleCopyClick(e)
  }

  // ── Mermaid 图表渲染 ──────────────────────────────────────────────────
  // mermaid 只需初始化一次；主题跟随应用 isDark（dark / default），保持与消息配色一致
  let mermaidInitialized = false
  function ensureMermaidInitialized() {
    if (mermaidInitialized) return
    mermaidInitialized = true
    mermaid.initialize({
      startOnLoad: false,
      theme: themeStore.isDark ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily: 'inherit',
      themeVariables: themeStore.isDark
        ? {
            background: 'transparent',
            primaryTextColor: '#f1f5f9',
            primaryColor: '#1e293b',
            primaryBorderColor: '#475569',
            lineColor: '#94a3b8',
            secondaryColor: '#334155',
            tertiaryColor: '#475569'
          }
        : {
            background: 'transparent',
            primaryTextColor: '#1e293b',
            primaryColor: '#eff6ff',
            primaryBorderColor: '#60a5fa',
            lineColor: '#475569',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#e2e8f0'
          }
    })
  }

  // 渲染容器内所有未处理的 mermaid 占位为 SVG；失败时回退显示源码 + 错误提示
  async function renderMermaidDiagrams() {
    const container = containerRef.value
    if (!container) return
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('.mermaid'))
    if (nodes.length === 0) return

    ensureMermaidInitialized()

    for (const node of nodes) {
      // 跳过已渲染或已失败的节点（流式期间 watch 会重复触发）
      if (node.dataset.processed === 'true' || node.dataset.failed === 'true') {
        continue
      }

      const source = node.dataset.mermaidSrc ?? ''
      const trimmedSource = source.trim()
      if (!trimmedSource) {
        node.dataset.processed = 'true'
        continue
      }

      // 流式未闭合的图（最后一行可能不完整）跳过，待内容完整后再渲染
      // 简单启发：图必须以合法图类型声明开头
      if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|C4Context|requirementDiagram)\b/i.test(trimmedSource)) {
        continue
      }

      const renderId = `m-${Math.random().toString(36).slice(2, 10)}`
      try {
        const { svg } = await mermaid.render(renderId, trimmedSource)
        node.innerHTML = svg
        node.dataset.processed = 'true'
      } catch (error) {
        // 失败：显示源码作为回退，避免空白；标记 failed 避免重复尝试
        node.dataset.failed = 'true'
        node.classList.add('mermaid--error')
        node.innerHTML = `<pre class="hljs"><code>${md.utils.escapeHtml(trimmedSource)}</code></pre>`
        console.warn('[MarkdownRenderer] Failed to render mermaid diagram:', error)
      }
    }
  }

  // 清理代码块内容缓存
  const clearCodeBlockContents = (): void => {
    codeBlockContents.value.clear()
    codeBlockCounter.value = 0
  }

  // 监听内容变化，清理旧的缓存
  watch(displayedText, () => {
    clearCodeBlockContents()
  })

  // 渲染后处理 mermaid 图表（流式输出稳定后触发）
  watch(renderedContent, () => {
    void nextTick(() => {
      void renderMermaidDiagrams()
    })
  })

  // 主题切换时重新初始化 mermaid 并重绘已渲染的图（浅色 ↔ 深色）
  watch(() => themeStore.isDark, () => {
    mermaidInitialized = false
    ensureMermaidInitialized()
    const container = containerRef.value
    if (!container) return
    // 重置所有 mermaid 节点的渲染标记，触发重绘
    for (const node of container.querySelectorAll<HTMLElement>('.mermaid')) {
      node.dataset.processed = ''
      node.dataset.failed = ''
      node.classList.remove('mermaid--error')
      node.innerHTML = ''
    }
    void nextTick(() => {
      void renderMermaidDiagrams()
    })
  })

  onMounted(() => {
    // 添加事件委托处理链接点击和复制按钮点击
    if (containerRef.value) {
      containerRef.value.addEventListener('click', handleClick)
    }
    // 首次挂载即渲染可能存在的 mermaid 图
    void nextTick(() => {
      void renderMermaidDiagrams()
    })
  })

  onUnmounted(() => {
    // 移除事件监听器
    if (containerRef.value) {
      containerRef.value.removeEventListener('click', handleClick)
    }
    // 清理缓存
    clearCodeBlockContents()
  })

  return {
    containerRef,
    renderedContent
  }
}
