<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { openUrl } from '@tauri-apps/plugin-opener'

const props = defineProps<{ content: string }>()

const containerRef = ref<HTMLDivElement | null>(null)

// 存储代码块原始内容，用于复制功能
const codeBlockContents = ref(new Map<string, string>())
const codeBlockCounter = ref(0)

// 创建 MarkdownIt 实例，配置语法高亮
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    // 生成唯一 ID 并存储原始代码
    const blockId = `code-block-${codeBlockCounter.value++}`
    codeBlockContents.value.set(blockId, str)

    // 确定语言标签
    let languageLabel = lang || 'auto'
    let highlightedCode: string

    // 代码块语法高亮
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlightedCode = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
      } catch {
        highlightedCode = md.utils.escapeHtml(str)
      }
    } else {
      // 没有指定语言时，使用自动检测
      try {
        const result = hljs.highlightAuto(str)
        highlightedCode = result.value
        // 如果自动检测到了语言，显示检测到的语言名
        if (result.language) {
          languageLabel = result.language
        }
      } catch {
        highlightedCode = md.utils.escapeHtml(str)
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

const renderedContent = computed(() => md.render(props.content))

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
watch(() => props.content, () => {
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
  line-height: 1.6;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  margin: 1em 0 0.5em;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.markdown-content h1 { font-size: 1.5em; }
.markdown-content h2 { font-size: 1.3em; }
.markdown-content h3 { font-size: 1.1em; }
.markdown-content h4 { font-size: 1em; }
.markdown-content h5 { font-size: 0.9em; }
.markdown-content h6 { font-size: 0.85em; }

.markdown-content p {
  margin: 0.5em 0;
}

.markdown-content ul,
.markdown-content ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-content li {
  margin: 0.25em 0;
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
  margin: 1em 0;
  background-color: #1e1e1e;
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* 代码块头部样式 */
.markdown-content .code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-2) var(--spacing-3);
  background-color: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

/* 语言标签样式 */
.markdown-content .code-block-language {
  font-size: var(--font-size-xs);
  color: #999;
  text-transform: lowercase;
  font-family: var(--font-family-mono);
}

/* 复制按钮样式 */
.markdown-content .code-block-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: #999;
  cursor: pointer;
  transition: all 0.2s ease;
}

.markdown-content .code-block-copy-btn:hover {
  background-color: #3d3d3d;
  color: #fff;
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

/* highlight.js 代码块样式 */
.markdown-content pre.hljs {
  padding: var(--spacing-3);
  background-color: #1e1e1e;
  margin: 0;
  border-radius: 0;
}

.markdown-content pre.hljs code {
  padding: 0;
  background: none;
  font-size: var(--font-size-sm);
  line-height: 1.5;
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
</style>
