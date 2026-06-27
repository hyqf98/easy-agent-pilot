import { computed, onMounted, onUnmounted, ref, watch, toRef } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useTypewriterText } from '@/composables/useTypewriterText'
import { useProjectStore } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
import { useNotificationStore } from '@/stores/notification'
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

  function isLikelyLocalFileHref(href: string): boolean {
    const normalizedHref = normalizeFileLinkPath(href)
    if (!normalizedHref || normalizedHref.startsWith('#') || normalizedHref.startsWith('//')) {
      return false
    }

    if (EXTERNAL_URL_SCHEME.test(normalizedHref)) {
      return false
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

    const sortedProjects = [...projectStore.projects]
      .sort((left, right) => normalizeComparablePath(right.path).length - normalizeComparablePath(left.path).length)

    if (WINDOWS_ABSOLUTE_PATH.test(normalizedHref) || normalizedHref.startsWith('/')) {
      const normalizedTarget = normalizeComparablePath(normalizedHref)
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
        filePath: normalizedHref
      }
    }

    const currentProject = projectStore.currentProject
    if (!currentProject) {
      return null
    }

    return {
      projectId: currentProject.id,
      projectPath: currentProject.path,
      filePath: joinProjectPath(currentProject.path, normalizedHref)
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

  const { displayedText } = useTypewriterText(
    toRef(props, 'content'),
    () => props.animate ?? false,
    { charsPerSecond: 140, maxChunkSize: 24 }
  )

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
            notificationStore.warning('无法打开文件', '当前路径未匹配到已导入项目，请确认项目已导入。')
            return
          }

          projectStore.setCurrentProject(fileTarget.projectId)
          uiStore.setAppMode('chat')

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

  // 清理代码块内容缓存
  const clearCodeBlockContents = (): void => {
    codeBlockContents.value.clear()
    codeBlockCounter.value = 0
  }

  // 监听内容变化，清理旧的缓存
  watch(displayedText, () => {
    clearCodeBlockContents()
  })

  onMounted(() => {
    // 添加事件委托处理链接点击和复制按钮点击
    if (containerRef.value) {
      containerRef.value.addEventListener('click', handleClick)
    }
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
