<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import MarkdownIt from 'markdown-it'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

// 内部项类型
interface InternalItem {
  name: string
  path: string
  description: string | null
  item_type: string
}

// Plugin 详情类型
interface PluginDetails {
  name: string
  path: string
  version: string | null
  description: string | null
  author: string | null
  install_source: string | null
  internal_skills: InternalItem[]
  internal_commands: InternalItem[]
  internal_agents: InternalItem[]
}

// 文件内容类型
interface FileContent {
  name: string
  path: string
  content: string
  file_type: string
}

const props = defineProps<{
  plugin: UnifiedPluginConfig
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'delete', plugin: UnifiedPluginConfig): void
}>()

const { t } = useI18n()

// Markdown 解析器
const md = ref<MarkdownIt | null>(null)

onMounted(async () => {
  md.value = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
})

// 状态
const isLoading = ref(true)
const pluginDetails = ref<PluginDetails | null>(null)
const activeSection = ref<'skills' | 'commands' | 'agents'>('skills')
const isSidebarHovered = ref(false)
const sidebarHoverTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

// 当前选中的项
const selectedItem = ref<InternalItem | null>(null)
const fileContent = ref<FileContent | null>(null)
const isLoadingFile = ref(false)
const isEditMode = ref(false)
const editContent = ref('')

// 当前显示的列表
const currentList = computed(() => {
  if (!pluginDetails.value) return []
  switch (activeSection.value) {
    case 'skills':
      return pluginDetails.value.internal_skills
    case 'commands':
      return pluginDetails.value.internal_commands
    case 'agents':
      return pluginDetails.value.internal_agents
    default:
      return []
  }
})

// 加载 Plugin 详情
async function loadPluginDetail() {
  isLoading.value = true
  selectedItem.value = null
  fileContent.value = null
  isEditMode.value = false
  isSidebarHovered.value = false
  try {
    const details = await invoke<PluginDetails>('get_plugin_details', {
      pluginPath: props.plugin.pluginPath
    })
    pluginDetails.value = details
  } catch (error) {
    console.error('Failed to load plugin detail:', error)
  } finally {
    isLoading.value = false
  }
}

// 侧边栏是否有内容
const hasListItems = computed(() => currentList.value.length > 0)

// 侧边栏鼠标进入
function handleSidebarMouseEnter() {
  if (sidebarHoverTimeout.value) {
    clearTimeout(sidebarHoverTimeout.value)
  }
  isSidebarHovered.value = true
}

// 侧边栏鼠标离开
function handleSidebarMouseLeave() {
  // 延迟收起，避免误操作
  sidebarHoverTimeout.value = setTimeout(() => {
    isSidebarHovered.value = false
  }, 300)
}

// 选择项并加载文件内容
async function selectItem(item: InternalItem) {
  selectedItem.value = item
  isLoadingFile.value = true
  fileContent.value = null
  isEditMode.value = false

  try {
    let content: string
    let filePath: string
    let fileType: string = 'markdown'

    // 检查 path 是否直接指向 .md 文件（单文件形式）
    const pathEndsWithMd = item.path.endsWith('.md')

    if (pathEndsWithMd) {
      // 直接读取该文件
      content = await invoke<string>('read_file_content', { filePath: item.path })
      filePath = item.path
    } else {
      // 目录形式：尝试读取对应的 .md 文件
      const mdPath = `${item.path}/${item.item_type}.md`
      const mdPathUpper = `${item.path}/${item.item_type.toUpperCase()}.md`

      // 先尝试小写，再尝试大写
      try {
        content = await invoke<string>('read_file_content', { filePath: mdPath })
        filePath = mdPath
      } catch {
        try {
          content = await invoke<string>('read_file_content', { filePath: mdPathUpper })
          filePath = mdPathUpper
        } catch {
          // 如果都失败，尝试读取目录下的任何 .md 文件
          const files = await invoke<{ name: string; path: string }[]>('list_directory_files', {
            dirPath: item.path,
            extension: '.md'
          })
          if (files && files.length > 0) {
            content = await invoke<string>('read_file_content', { filePath: files[0].path })
            filePath = files[0].path
          } else {
            throw new Error('No markdown file found')
          }
        }
      }
    }

    fileContent.value = {
      name: item.name,
      path: filePath,
      content,
      file_type: fileType
    }
  } catch (error) {
    console.error('Failed to load item content:', error)
    fileContent.value = null
  } finally {
    isLoadingFile.value = false
  }
}

// 返回列表
function handleBack() {
  emit('back')
}

// 删除 Plugin
function handleDelete() {
  emit('delete', props.plugin)
}

// 切换标签页
function switchSection(section: 'skills' | 'commands' | 'agents') {
  activeSection.value = section
  selectedItem.value = null
  fileContent.value = null
  isEditMode.value = false
}

// 切换编辑模式
function toggleEditMode() {
  if (isEditMode.value) {
    isEditMode.value = false
  } else {
    if (fileContent.value) {
      editContent.value = fileContent.value.content
      isEditMode.value = true
    }
  }
}

// 保存编辑
async function saveEdit() {
  if (!fileContent.value) return

  try {
    await invoke('write_file_content', {
      filePath: fileContent.value.path,
      content: editContent.value
    })
    fileContent.value.content = editContent.value
    isEditMode.value = false
  } catch (error) {
    console.error('Failed to save file:', error)
  }
}

// 获取项图标
function getItemIcon(type: string): string {
  switch (type) {
    case 'skill':
      return 'lucide:book-open'
    case 'command':
      return 'lucide:terminal'
    case 'agent':
      return 'lucide:bot'
    default:
      return 'lucide:file'
  }
}

// 渲染 Markdown
const renderedMarkdown = computed(() => {
  if (!fileContent.value || !md.value) return ''
  if (fileContent.value.file_type !== 'markdown') return ''
  try {
    return md.value.render(fileContent.value.content)
  } catch {
    return `<pre>${escapeHtml(fileContent.value.content)}</pre>`
  }
})

// 转义 HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 监听 plugin 变化
watch(() => props.plugin, () => {
  loadPluginDetail()
}, { immediate: true })

onMounted(() => {
  loadPluginDetail()
})
</script>

<template>
  <div class="plugin-detail">
    <!-- 头部工具栏 -->
    <div class="plugin-detail__toolbar">
      <div class="plugin-detail__toolbar-left">
        <EaButton variant="ghost" size="small" @click="handleBack">
          <EaIcon name="lucide:arrow-left" />
          {{ t('common.back') }}
        </EaButton>
        <div class="plugin-detail__breadcrumb">
          <EaIcon name="lucide:puzzle" class="plugin-detail__icon" />
          <span class="plugin-detail__name">{{ plugin.name }}</span>
          <span v-if="plugin.version" class="plugin-detail__version">v{{ plugin.version }}</span>
          <template v-if="selectedItem">
            <EaIcon name="lucide:chevron-right" class="plugin-detail__chevron" />
            <EaIcon :name="getItemIcon(selectedItem.item_type)" class="plugin-detail__type-icon" />
            <span class="plugin-detail__current-file">{{ selectedItem.name }}</span>
          </template>
        </div>
      </div>
      <div class="plugin-detail__toolbar-right">
        <!-- 列表数量提示 -->
        <div v-if="hasListItems && !selectedItem" class="plugin-detail__list-hint">
          <EaIcon name="lucide:list" />
          <span>{{ currentList.length }} {{ activeSection === 'skills' ? t('settings.plugins.internalSkills') :
             activeSection === 'commands' ? t('settings.plugins.internalCommands') :
             t('settings.plugins.internalAgents') }}</span>
          <span class="plugin-detail__list-hint-text">{{ t('settings.plugins.hoverToExpand') }}</span>
        </div>

        <!-- 编辑按钮 -->
        <EaButton
          v-if="fileContent && plugin.source === 'file'"
          :variant="isEditMode ? 'primary' : 'ghost'"
          size="small"
          @click="toggleEditMode"
        >
          <EaIcon :name="isEditMode ? 'lucide:eye' : 'lucide:pencil'" />
          {{ isEditMode ? t('common.view') : t('common.edit') }}
        </EaButton>

        <!-- 保存按钮 -->
        <EaButton
          v-if="isEditMode"
          variant="primary"
          size="small"
          @click="saveEdit"
        >
          <EaIcon name="lucide:save" />
          {{ t('common.save') }}
        </EaButton>

        <!-- 删除按钮 -->
        <EaButton
          v-if="plugin.source === 'file'"
          variant="ghost"
          size="small"
          danger
          @click="handleDelete"
        >
          <EaIcon name="lucide:trash-2" />
        </EaButton>
      </div>
    </div>

    <!-- 标签页切换 -->
    <div class="plugin-detail__tabs">
      <button
        class="plugin-detail__tab"
        :class="{ 'plugin-detail__tab--active': activeSection === 'skills' }"
        @click="switchSection('skills')"
      >
        <EaIcon name="lucide:book-open" />
        {{ t('settings.plugins.internalSkills') }}
        <span class="plugin-detail__tab-count">{{ pluginDetails?.internal_skills.length || 0 }}</span>
      </button>
      <button
        class="plugin-detail__tab"
        :class="{ 'plugin-detail__tab--active': activeSection === 'commands' }"
        @click="switchSection('commands')"
      >
        <EaIcon name="lucide:terminal" />
        {{ t('settings.plugins.internalCommands') }}
        <span class="plugin-detail__tab-count">{{ pluginDetails?.internal_commands.length || 0 }}</span>
      </button>
      <button
        class="plugin-detail__tab"
        :class="{ 'plugin-detail__tab--active': activeSection === 'agents' }"
        @click="switchSection('agents')"
      >
        <EaIcon name="lucide:bot" />
        {{ t('settings.plugins.internalAgents') }}
        <span class="plugin-detail__tab-count">{{ pluginDetails?.internal_agents.length || 0 }}</span>
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="isLoading" class="plugin-detail__loading">
      <EaIcon name="lucide:loader-2" class="plugin-detail__spinner" />
      {{ t('common.loading') }}
    </div>

    <!-- 主体 -->
    <div v-else class="plugin-detail__body">
      <!-- 文件列表侧边栏 - 悬停展开 -->
      <div
        v-if="hasListItems"
        class="plugin-detail__sidebar"
        :class="{ 'plugin-detail__sidebar--expanded': isSidebarHovered }"
        @mouseenter="handleSidebarMouseEnter"
        @mouseleave="handleSidebarMouseLeave"
      >
        <div class="plugin-detail__sidebar-header">
          <h3>
            {{ activeSection === 'skills' ? t('settings.plugins.internalSkills') :
               activeSection === 'commands' ? t('settings.plugins.internalCommands') :
               t('settings.plugins.internalAgents') }}
          </h3>
        </div>
        <div class="plugin-detail__sidebar-content">
          <div
            v-for="item in currentList"
            :key="item.path"
            class="plugin-detail__file-item"
            :class="{ 'plugin-detail__file-item--active': selectedItem?.path === item.path }"
            @click="selectItem(item)"
          >
            <EaIcon :name="getItemIcon(item.item_type)" class="plugin-detail__file-icon" />
            <div class="plugin-detail__file-info">
              <span class="plugin-detail__file-name">{{ item.name }}</span>
              <span v-if="item.description" class="plugin-detail__file-desc">{{ item.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主面板 -->
      <div class="plugin-detail__main">
        <!-- 有选中项时显示内容 -->
        <template v-if="selectedItem">
          <!-- 加载文件中 -->
          <div v-if="isLoadingFile" class="plugin-detail__loading-content">
            <EaIcon name="lucide:loader-2" class="plugin-detail__spinner" />
            {{ t('common.loading') }}
          </div>

          <!-- 编辑模式 -->
          <div v-else-if="isEditMode && fileContent" class="plugin-detail__editor">
            <textarea
              v-model="editContent"
              class="plugin-detail__textarea"
              :placeholder="t('settings.skills.editPlaceholder')"
            />
          </div>

          <!-- Markdown 预览 -->
          <div
            v-else-if="fileContent?.file_type === 'markdown'"
            class="plugin-detail__markdown markdown-body"
            v-html="renderedMarkdown"
          />

          <!-- 代码预览 -->
          <div v-else-if="fileContent" class="plugin-detail__code">
            <pre class="plugin-detail__code-content"><code>{{ fileContent.content }}</code></pre>
          </div>

          <!-- 无内容 -->
          <div v-else class="plugin-detail__no-content">
            <EaIcon name="lucide:file-x" class="plugin-detail__no-content-icon" />
            <p>{{ t('settings.skills.noContent') }}</p>
          </div>
        </template>

        <!-- 无选中项时显示插件信息 -->
        <template v-else>
          <!-- 元信息 -->
          <div v-if="pluginDetails" class="plugin-detail__info">
            <div class="plugin-detail__info-grid">
              <div v-if="pluginDetails.author" class="plugin-detail__info-item">
                <span class="plugin-detail__info-label">
                  <EaIcon name="lucide:user" />
                  {{ t('settings.plugins.author') }}
                </span>
                <span class="plugin-detail__info-value">{{ pluginDetails.author }}</span>
              </div>
              <div v-if="pluginDetails.install_source" class="plugin-detail__info-item">
                <span class="plugin-detail__info-label">
                  <EaIcon name="lucide:download" />
                  {{ t('settings.plugins.installedFrom') }}
                </span>
                <span class="plugin-detail__info-value">{{ pluginDetails.install_source }}</span>
              </div>
              <div class="plugin-detail__info-item">
                <span class="plugin-detail__info-label">
                  <EaIcon name="lucide:folder" />
                  {{ t('settings.plugins.path') }}
                </span>
                <code class="plugin-detail__info-value">{{ pluginDetails.path }}</code>
              </div>
            </div>

            <div v-if="pluginDetails.description" class="plugin-detail__description">
              {{ pluginDetails.description }}
            </div>

            <!-- 统计信息 -->
            <div class="plugin-detail__stats">
              <div class="plugin-detail__stat">
                <EaIcon name="lucide:book-open" />
                <span>{{ pluginDetails.internal_skills.length }} {{ t('settings.plugins.internalSkills') }}</span>
              </div>
              <div class="plugin-detail__stat">
                <EaIcon name="lucide:terminal" />
                <span>{{ pluginDetails.internal_commands.length }} {{ t('settings.plugins.internalCommands') }}</span>
              </div>
              <div class="plugin-detail__stat">
                <EaIcon name="lucide:bot" />
                <span>{{ pluginDetails.internal_agents.length }} {{ t('settings.plugins.internalAgents') }}</span>
              </div>
            </div>

            <!-- 有内容时显示选择提示 -->
            <div v-if="currentList.length > 0" class="plugin-detail__select-hint">
              <EaIcon name="lucide:mouse-pointer-click" class="plugin-detail__select-hint-icon" />
              <p>{{ t('settings.plugins.selectFromList') }}</p>
            </div>
          </div>

          <!-- 无内容时显示空状态提示 -->
          <div v-else class="plugin-detail__empty-section">
            <EaIcon name="lucide:inbox" class="plugin-detail__empty-icon" />
            <p>
              {{ activeSection === 'skills' ? t('settings.plugins.noInternalSkills') :
                 activeSection === 'commands' ? t('settings.plugins.noInternalCommands') :
                 t('settings.plugins.noInternalAgents') }}
            </p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

/* 工具栏 */
.plugin-detail__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3) var(--spacing-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
}

.plugin-detail__toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.plugin-detail__toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.plugin-detail__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.plugin-detail__icon {
  width: 20px;
  height: 20px;
  color: var(--color-warning);
}

.plugin-detail__name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
}

.plugin-detail__version {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background: var(--color-background-tertiary);
  border-radius: var(--radius-sm);
}

.plugin-detail__chevron {
  width: 14px;
  height: 14px;
  color: var(--color-text-tertiary);
}

.plugin-detail__type-icon {
  width: 16px;
  height: 16px;
  color: var(--color-primary);
}

.plugin-detail__current-file {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.plugin-detail__badge {
  padding: 2px 6px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.plugin-detail__list-hint {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-3);
  background: var(--color-background-tertiary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 标签页 */
.plugin-detail__tabs {
  display: flex;
  gap: var(--spacing-1);
  padding: var(--spacing-2) var(--spacing-4);
  background: var(--color-background-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.plugin-detail__tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.plugin-detail__tab:hover {
  background: var(--color-background-secondary);
  color: var(--color-text);
}

.plugin-detail__tab--active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
}

.plugin-detail__tab svg {
  width: 14px;
  height: 14px;
}

.plugin-detail__tab-count {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  background: var(--color-background-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
}

.plugin-detail__tab--active .plugin-detail__tab-count {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

/* 主体 */
.plugin-detail__body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 侧边栏 - 悬停展开 */
.plugin-detail__sidebar {
  width: 40px;
  background: var(--color-background-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
  transition: width 0.25s ease;
  overflow: hidden;
  position: relative;
}

.plugin-detail__sidebar::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 40px;
  background: var(--color-primary);
  border-radius: 0 4px 4px 0;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.plugin-detail__sidebar:hover::before,
.plugin-detail__sidebar--expanded::before {
  opacity: 0;
}

.plugin-detail__sidebar--expanded {
  width: 280px;
}

.plugin-detail__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3) var(--spacing-4);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  overflow: hidden;
}

.plugin-detail__sidebar-header h3 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.plugin-detail__sidebar--expanded .plugin-detail__sidebar-header h3 {
  opacity: 1;
}

.plugin-detail__sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-2);
  opacity: 0;
  transition: opacity 0.2s;
}

.plugin-detail__sidebar--expanded .plugin-detail__sidebar-content {
  opacity: 1;
}

.plugin-detail__file-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.plugin-detail__file-item:hover {
  background: var(--color-background-tertiary);
}

.plugin-detail__file-item--active {
  background: var(--color-primary-bg);
}

.plugin-detail__file-icon {
  width: 18px;
  height: 18px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
  margin-top: 2px;
}

.plugin-detail__file-item--active .plugin-detail__file-icon {
  color: var(--color-primary);
}

.plugin-detail__file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.plugin-detail__file-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-detail__file-desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

/* 主面板 */
.plugin-detail__main {
  flex: 1;
  overflow: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 插件信息 */
.plugin-detail__info {
  padding: var(--spacing-8);
  max-width: 1200px;
  margin: 0 auto;
  flex: 1;
  overflow-y: auto;
}

.plugin-detail__info-grid {
  display: grid;
  gap: var(--spacing-3);
  margin-bottom: var(--spacing-4);
}

.plugin-detail__info-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-2) var(--spacing-3);
  background: var(--color-background-secondary);
  border-radius: var(--radius-md);
}

.plugin-detail__info-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  min-width: 100px;
}

.plugin-detail__info-label svg {
  width: 14px;
  height: 14px;
}

.plugin-detail__info-value {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.plugin-detail__info-value code {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.plugin-detail__description {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin-bottom: var(--spacing-4);
}

.plugin-detail__stats {
  display: flex;
  gap: var(--spacing-4);
  padding: var(--spacing-3);
  background: var(--color-background-secondary);
  border-radius: var(--radius-lg);
}

.plugin-detail__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.plugin-detail__stat svg {
  width: 16px;
  height: 16px;
  color: var(--color-text-tertiary);
}

/* 编辑器 */
.plugin-detail__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.plugin-detail__textarea {
  flex: 1;
  width: 100%;
  min-height: 100%;
  padding: var(--spacing-6);
  border: none;
  background: var(--color-surface);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  line-height: 1.7;
  resize: none;
  outline: none;
}

.plugin-detail__textarea:focus {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

/* Markdown 预览 */
.plugin-detail__markdown {
  padding: var(--spacing-8);
  max-width: 1200px;
  margin: 0 auto;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  width: 100%;
}

/* 代码预览 */
.plugin-detail__code {
  padding: var(--spacing-6);
  background: var(--color-background-secondary);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.plugin-detail__code-content {
  margin: 0;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 加载状态 */
.plugin-detail__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.plugin-detail__loading-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  height: 100%;
  color: var(--color-text-tertiary);
}

.plugin-detail__spinner {
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 空状态 */
.plugin-detail__no-content,
.plugin-detail__empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  height: 100%;
  color: var(--color-text-tertiary);
  padding: var(--spacing-6);
}

.plugin-detail__no-content-icon,
.plugin-detail__empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

/* 选择提示 */
.plugin-detail__select-hint {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  margin-top: var(--spacing-4);
  background: var(--color-primary-bg);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
}

.plugin-detail__select-hint-icon {
  width: 18px;
  height: 18px;
}

/* Markdown 样式 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: var(--spacing-6);
  margin-bottom: var(--spacing-3);
  font-weight: var(--font-weight-semibold);
  line-height: 1.3;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h1) { font-size: var(--font-size-2xl); }
.markdown-body :deep(h2) { font-size: var(--font-size-xl); }
.markdown-body :deep(h3) { font-size: var(--font-size-lg); }
.markdown-body :deep(h4) { font-size: var(--font-size-base); }

.markdown-body :deep(p) {
  margin-bottom: var(--spacing-4);
  line-height: 1.7;
  font-size: var(--font-size-base);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: var(--spacing-4);
  padding-left: var(--spacing-6);
}

.markdown-body :deep(li) {
  margin-bottom: var(--spacing-2);
  line-height: 1.6;
}

.markdown-body :deep(code) {
  padding: 2px 6px;
  background: var(--color-background-secondary);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  margin: var(--spacing-4) 0;
  padding: var(--spacing-4);
  background: var(--color-background-secondary);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.markdown-body :deep(blockquote) {
  margin: var(--spacing-4) 0;
  padding: var(--spacing-3) var(--spacing-4);
  border-left: 4px solid var(--color-primary);
  background: var(--color-background-secondary);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
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
  margin: var(--spacing-4) 0;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: var(--spacing-2) var(--spacing-4);
  border: 1px solid var(--color-border);
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--color-background-secondary);
  font-weight: var(--font-weight-medium);
}

.markdown-body :deep(hr) {
  margin: var(--spacing-6) 0;
  border: none;
  border-top: 1px solid var(--color-border);
}
</style>
