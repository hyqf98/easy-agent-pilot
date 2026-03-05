<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import { EaIcon } from '@/components/common'

const props = defineProps<{
  content: string
  fileType: string
  filePath?: string
}>()

// Markdown 解析器
const md = ref<MarkdownIt | null>(null)

onMounted(async () => {
  md.value = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
})

// 判断是否为 Markdown
const isMarkdown = computed(() => props.fileType === 'markdown')

// 判断是否为代码文件
const isCode = computed(() => {
  return ['javascript', 'typescript', 'python', 'rust', 'json', 'yaml', 'toml', 'html', 'css', 'shell'].includes(props.fileType)
})

// 获取代码语言
const codeLanguage = computed(() => {
  const languageMap: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    rust: 'Rust',
    json: 'JSON',
    yaml: 'YAML',
    toml: 'TOML',
    html: 'HTML',
    css: 'CSS',
    shell: 'Shell',
    text: 'Text',
  }
  return languageMap[props.fileType] || 'Code'
})

// 渲染 Markdown 内容
const renderedMarkdown = computed(() => {
  if (!isMarkdown.value || !md.value) return ''
  try {
    return md.value.render(props.content)
  } catch {
    return `<pre>${escapeHtml(props.content)}</pre>`
  }
})

// 转义 HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 获取文件图标
const fileIcon = computed(() => {
  switch (props.fileType) {
    case 'markdown':
      return 'lucide:file-text'
    case 'javascript':
    case 'typescript':
      return 'lucide:file-code'
    case 'python':
      return 'lucide:file-code'
    case 'json':
      return 'lucide:file-json'
    case 'html':
      return 'lucide:file-code'
    case 'css':
      return 'lucide:file-code'
    default:
      return 'lucide:file'
  }
})
</script>

<template>
  <div class="file-preview">
    <!-- 文件头部 -->
    <div v-if="filePath" class="file-preview__header">
      <EaIcon :name="fileIcon" class="file-preview__icon" />
      <span class="file-preview__path">{{ filePath }}</span>
      <span class="file-preview__type">{{ fileType }}</span>
    </div>

    <!-- Markdown 预览 -->
    <div
      v-if="isMarkdown"
      class="file-preview__markdown markdown-body"
      v-html="renderedMarkdown"
    ></div>

    <!-- 代码预览 -->
    <div v-else-if="isCode" class="file-preview__code">
      <div class="file-preview__code-header">
        <span class="file-preview__language">{{ codeLanguage }}</span>
      </div>
      <pre class="file-preview__code-content"><code>{{ content }}</code></pre>
    </div>

    <!-- 纯文本预览 -->
    <div v-else class="file-preview__text">
      <pre>{{ content }}</pre>
    </div>
  </div>
</template>

<style scoped>
.file-preview {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.file-preview__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.file-preview__icon {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
}

.file-preview__path {
  flex: 1;
  font-family: var(--font-family-mono);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview__type {
  padding: 2px 8px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
}

.file-preview__markdown {
  padding: var(--spacing-4);
  overflow: auto;
  max-height: 600px;
}

.file-preview__code {
  overflow: hidden;
}

.file-preview__code-header {
  display: flex;
  align-items: center;
  padding: var(--spacing-2) var(--spacing-4);
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
}

.file-preview__language {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
}

.file-preview__code-content {
  margin: 0;
  padding: var(--spacing-4);
  background: var(--color-background-secondary);
  overflow: auto;
  max-height: 600px;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.file-preview__code-content code {
  background: transparent;
}

.file-preview__text {
  padding: var(--spacing-4);
  overflow: auto;
  max-height: 600px;
}

.file-preview__text pre {
  margin: 0;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Markdown 样式 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: var(--spacing-4);
  margin-bottom: var(--spacing-2);
  font-weight: var(--font-weight-semibold);
  line-height: 1.3;
}

.markdown-body :deep(h1) { font-size: var(--font-size-2xl); }
.markdown-body :deep(h2) { font-size: var(--font-size-xl); }
.markdown-body :deep(h3) { font-size: var(--font-size-lg); }
.markdown-body :deep(h4) { font-size: var(--font-size-base); }

.markdown-body :deep(p) {
  margin-bottom: var(--spacing-3);
  line-height: 1.6;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: var(--spacing-3);
  padding-left: var(--spacing-6);
}

.markdown-body :deep(li) {
  margin-bottom: var(--spacing-1);
}

.markdown-body :deep(code) {
  padding: 2px 6px;
  background: var(--color-background-secondary);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  margin-bottom: var(--spacing-3);
  padding: var(--spacing-3);
  background: var(--color-background-secondary);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  margin: var(--spacing-3) 0;
  padding-left: var(--spacing-4);
  border-left: 3px solid var(--color-border);
  color: var(--color-text-secondary);
}

.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  width: 100%;
  margin-bottom: var(--spacing-3);
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-border);
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--color-background-secondary);
  font-weight: var(--font-weight-medium);
}

.markdown-body :deep(hr) {
  margin: var(--spacing-4) 0;
  border: none;
  border-top: 1px solid var(--color-border);
}
</style>
