<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, toRef } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useTypewriterText } from '@/composables/useTypewriterText'

const props = withDefaults(defineProps<{
  content: string
  animate?: boolean
}>(), {
  animate: false
})

const containerRef = ref<HTMLDivElement | null>(null)

// 存储代码块原始内容，用于复制功能
const codeBlockContents = ref(new Map<string, string>())
const codeBlockCounter = ref(0)

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

// 创建 MarkdownIt 实例，配置语法高亮
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    const normalizedCode = trimCodeFencePadding(str)
    // 生成唯一 ID 并存储原始代码
    const blockId = `code-block-${codeBlockCounter.value++}`
    codeBlockContents.value.set(blockId, normalizedCode)

    // 确定语言标签
    let languageLabel = lang || 'auto'
    let highlightedCode: string

    // 代码块语法高亮
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlightedCode = hljs.highlight(normalizedCode, { language: lang, ignoreIllegals: true }).value
      } catch {
        highlightedCode = md.utils.escapeHtml(normalizedCode)
      }
    } else {
      // 没有指定语言时，使用自动检测
      try {
        const result = hljs.highlightAuto(normalizedCode)
        highlightedCode = result.value
        // 如果自动检测到了语言，显示检测到的语言名
        if (result.language) {
          languageLabel = result.language
        }
      } catch {
        highlightedCode = md.utils.escapeHtml(normalizedCode)
      }
    }

    // 返回带有包装器的代码块
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
})

// 自定义链接渲染，使用 Tauri opener 在外部浏览器打开
const defaultLinkOpenRender = md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
  // 添加 target="_blank" 和安全属性
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

  // 添加自定义类名
  const classIndex = tokens[idx].attrIndex('class')
  if (classIndex < 0) {
    tokens[idx].attrPush(['class', 'external-link'])
  } else if (tokens[idx].attrs) {
    tokens[idx].attrs[classIndex][1] += ' external-link'
  }

  return defaultLinkOpenRender(tokens, idx, options, env, self)
}

const { displayedText } = useTypewriterText(
  toRef(props, 'content'),
  toRef(props, 'animate'),
  { charsPerSecond: 140, maxChunkSize: 24 }
)

const renderedContent = computed(() => md.render(displayedText.value))

// 处理链接点击，使用 Tauri opener
const handleLinkClick = async (e: MouseEvent): Promise<void> => {
  const target = e.target as HTMLElement
  const link = target.closest('a.external-link') as HTMLAnchorElement | null

  if (link) {
    e.preventDefault()
    const href = link.getAttribute('href')
    if (href) {
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
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-content"
    v-html="renderedContent"
  />
</template>

<style>
@import 'highlight.js/styles/github-dark.css';

.markdown-content {
  --md-code-bg: linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%);
  --md-code-header-bg: rgba(219, 234, 254, 0.92);
  --md-code-border: rgba(96, 165, 250, 0.28);
  --md-code-fg: #1e293b;
  --md-code-muted: #475569;
  --md-code-hover-bg: rgba(191, 219, 254, 0.95);
  line-height: 1.55;
  color: var(--color-text-primary);
  width: 100%;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  margin: 0.55em 0 0.22em;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.3;
}

.markdown-content h1 { font-size: 1.5em; }
.markdown-content h2 { font-size: 1.3em; }
.markdown-content h3 { font-size: 1.1em; }
.markdown-content h4 { font-size: 1em; }
.markdown-content h5 { font-size: 0.9em; }
.markdown-content h6 { font-size: 0.85em; }

.markdown-content p {
  margin: 0.22em 0 0.38em;
  color: inherit;
}

.markdown-content ul,
.markdown-content ol {
  margin: 0.22em 0 0.4em;
  padding-left: 1.5em;
}

.markdown-content li {
  margin: 0.12em 0;
  color: inherit;
}

/* 行内代码样式 */
.markdown-content code {
  padding: 0.2em 0.4em;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: 0.9em;
}

/* 代码块容器样式 */
.markdown-content pre {
  margin: 0;
  padding: 0;
  background-color: transparent;
  overflow-x: auto;
}

/* 代码块包装器样式 */
.markdown-content .code-block-wrapper {
  margin: 0 0 0.35em;
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--md-code-border);
  border-radius: var(--radius-md);
  background: var(--md-code-bg);
  box-shadow: 0 10px 24px rgba(148, 163, 184, 0.16);
  overflow: hidden;
}

/* 代码块头部样式 */
.markdown-content .code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.18rem 0.58rem;
  background: var(--md-code-header-bg);
  border-bottom: 1px solid var(--md-code-border);
}

/* 语言标签样式 */
.markdown-content .code-block-language {
  font-size: 0.68rem;
  color: var(--md-code-muted);
  text-transform: lowercase;
  font-family: var(--font-family-mono);
  letter-spacing: 0.02em;
}

/* 复制按钮样式 */
.markdown-content .code-block-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--md-code-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.markdown-content .code-block-copy-btn:hover {
  background-color: var(--md-code-hover-bg);
  color: var(--md-code-fg);
}

.markdown-content .code-block-copy-btn .check-icon {
  display: none;
}

.markdown-content .code-block-copy-btn.copied {
  color: #4ade80;
}

.markdown-content .code-block-copy-btn.copied .copy-icon {
  display: none;
}

.markdown-content .code-block-copy-btn.copied .check-icon {
  display: block;
}

.markdown-content .hljs {
  color: var(--md-code-fg);
  background: transparent;
}

/* highlight.js 代码块样式 */
.markdown-content pre.hljs {
  padding: 0 0.76rem 0.62rem;
  background: transparent;
  margin: 0;
  border-radius: 0;
}

.markdown-content pre.hljs code {
  padding: 0;
  background: none;
  font-size: 0.82rem;
  line-height: 1.38;
}

.markdown-content .hljs-comment,
.markdown-content .hljs-quote {
  color: #64748b;
  font-style: italic;
}

.markdown-content .hljs-keyword,
.markdown-content .hljs-selector-tag,
.markdown-content .hljs-subst {
  color: #7c3aed;
}

.markdown-content .hljs-string,
.markdown-content .hljs-doctag,
.markdown-content .hljs-template-variable,
.markdown-content .hljs-variable,
.markdown-content .hljs-regexp {
  color: #0f766e;
}

.markdown-content .hljs-title,
.markdown-content .hljs-section,
.markdown-content .hljs-selector-id,
.markdown-content .hljs-selector-class {
  color: #2563eb;
}

.markdown-content .hljs-number,
.markdown-content .hljs-literal,
.markdown-content .hljs-symbol,
.markdown-content .hljs-bullet,
.markdown-content .hljs-attr {
  color: #c2410c;
}

.markdown-content .hljs-type,
.markdown-content .hljs-built_in,
.markdown-content .hljs-class .hljs-title {
  color: #b45309;
}

/* 链接样式 */
.markdown-content a {
  color: var(--color-primary);
  text-decoration: none;
  cursor: pointer;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content a.external-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.markdown-content a.external-link::after {
  content: '↗';
  font-size: 0.8em;
  opacity: 0.7;
}

/* 引用块样式 */
.markdown-content blockquote {
  margin: 0.5em 0;
  padding: var(--spacing-2) var(--spacing-4);
  border-left: 3px solid var(--color-border);
  background-color: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

/* 粗体和斜体 */
.markdown-content strong {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.markdown-content em {
  font-style: italic;
}

/* 删除线 */
.markdown-content del {
  text-decoration: line-through;
  color: var(--color-text-tertiary);
}

/* 表格样式 */
.markdown-content table {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.markdown-content th,
.markdown-content td {
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-border);
  text-align: left;
  color: inherit;
}

.markdown-content th {
  background-color: var(--color-bg-secondary);
  font-weight: var(--font-weight-medium);
}

.markdown-content tr:nth-child(even) {
  background-color: var(--color-bg-secondary);
}

/* 水平分隔线 */
.markdown-content hr {
  margin: var(--spacing-4) 0;
  border: none;
  border-top: 1px solid var(--color-border);
}

/* 图片样式 */
.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  margin: var(--spacing-2) 0;
}

:global([data-theme='dark']) .markdown-content,
:global(.dark) .markdown-content {
  --md-code-bg: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  --md-code-header-bg: rgba(30, 41, 59, 0.92);
  --md-code-border: rgba(148, 163, 184, 0.18);
  --md-code-fg: #e2e8f0;
  --md-code-muted: #94a3b8;
  --md-code-hover-bg: rgba(51, 65, 85, 0.96);
  color: #e5e7eb;
}

:global([data-theme='dark']) .markdown-content h1,
:global(.dark) .markdown-content h1,
:global([data-theme='dark']) .markdown-content h2,
:global(.dark) .markdown-content h2,
:global([data-theme='dark']) .markdown-content h3,
:global(.dark) .markdown-content h3,
:global([data-theme='dark']) .markdown-content h4,
:global(.dark) .markdown-content h4,
:global([data-theme='dark']) .markdown-content h5,
:global(.dark) .markdown-content h5,
:global([data-theme='dark']) .markdown-content h6,
:global(.dark) .markdown-content h6,
:global([data-theme='dark']) .markdown-content strong,
:global(.dark) .markdown-content strong {
  color: #f8fafc;
}

:global([data-theme='dark']) .markdown-content code,
:global(.dark) .markdown-content code {
  background-color: rgba(148, 163, 184, 0.14);
}

:global([data-theme='dark']) .markdown-content blockquote,
:global(.dark) .markdown-content blockquote {
  border-left-color: rgba(148, 163, 184, 0.3);
  background-color: rgba(30, 41, 59, 0.72);
  color: #cbd5e1;
}

:global([data-theme='dark']) .markdown-content th,
:global(.dark) .markdown-content th {
  background-color: rgba(30, 41, 59, 0.76);
}

:global([data-theme='dark']) .markdown-content tr:nth-child(even),
:global(.dark) .markdown-content tr:nth-child(even) {
  background-color: rgba(30, 41, 59, 0.42);
}
</style>
