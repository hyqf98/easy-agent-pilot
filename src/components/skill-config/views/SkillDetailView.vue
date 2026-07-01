<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import { EaButton, EaIcon } from '@/components/common'
import ConfigFileWorkspace from '@/components/skill-config/common/ConfigFileWorkspace.vue'

// Skill 目录条目（递归）
interface SkillFileEntry {
  name: string
  path: string
  relPath: string
  isDir: boolean
  fileType: string
}

const props = defineProps<{
  skill: UnifiedSkillConfig
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'delete', skill: UnifiedSkillConfig): void
}>()

const { t } = useI18n()
const notificationStore = useNotificationStore()

// 状态
const isLoading = ref(true)
const allEntries = ref<SkillFileEntry[]>([])
const isEditMode = ref(false)
const editContent = ref('')
const isSaving = ref(false)

// 当前选中的文件
const selectedPath = ref<string | null>(null)
const currentFileContent = ref('')
const currentFileType = ref('text')
const currentFileName = ref('')
const isLoadingFile = ref(false)

// 展开的文件夹（按 relPath 记录）
const expandedDirs = ref<Set<string>>(new Set())

// ── 树形结构构建 ──────────────────────────────────────────
interface TreeNode {
  key: string
  name: string
  relPath: string
  path: string
  isDir: boolean
  fileType: string
  children: TreeNode[]
  depth: number
}

const fileTree = computed<TreeNode[]>(() => {
  const root: TreeNode = {
    key: '__root__',
    name: '',
    relPath: '',
    path: props.skill.skillPath,
    isDir: true,
    fileType: 'directory',
    children: [],
    depth: 0,
  }

  for (const entry of allEntries.value) {
    const parts = entry.relPath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const partRelPath = parts.slice(0, i + 1).join('/')
      const isLast = i === parts.length - 1
      const isDir = isLast ? entry.isDir : true

      let child = current.children.find(c => c.name === parts[i])
      if (!child) {
        child = {
          key: partRelPath,
          name: parts[i],
          relPath: partRelPath,
          path: isLast ? entry.path : `${props.skill.skillPath}/${partRelPath}`,
          isDir,
          fileType: isDir ? 'directory' : entry.fileType,
          children: [],
          depth: i + 1,
        }
        current.children.push(child)
      }
      current = child
    }
  }

  // 排序：目录在前，同类按名
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(root.children)

  return root.children
})

// 扁平化可见节点（考虑展开状态），用于 v-for 渲染
interface FlatNode extends TreeNode {}

const visibleNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = []

  function walk(nodes: TreeNode[]) {
    for (const node of nodes) {
      result.push(node)
      if (node.isDir && expandedDirs.value.has(node.relPath)) {
        walk(node.children)
      }
    }
  }

  walk(fileTree.value)
  return result
})

// 当前显示的文件
const currentFile = computed(() => {
  if (!selectedPath.value) return null
  return {
    name: currentFileName.value,
    path: selectedPath.value,
    content: currentFileContent.value,
    file_type: currentFileType.value,
  }
})

// 默认展开第一层 + 选中 SKILL.md
function initTreeSelection() {
  expandedDirs.value = new Set()
  // 展开顶层目录
  for (const node of fileTree.value) {
    if (node.isDir) {
      expandedDirs.value.add(node.relPath)
    }
  }
  // 默认选中 SKILL.md
  const skillMd = allEntries.value.find(e => !e.isDir && (e.name === 'SKILL.md' || e.name === 'skill.md'))
  if (skillMd) {
    void selectFile(skillMd)
  } else {
    const firstFile = allEntries.value.find(e => !e.isDir)
    if (firstFile) {
      void selectFile(firstFile)
    }
  }
}

function toggleDir(node: TreeNode) {
  if (expandedDirs.value.has(node.relPath)) {
    expandedDirs.value.delete(node.relPath)
  } else {
    expandedDirs.value.add(node.relPath)
  }
}

// 选择文件并加载内容
async function selectFile(entry: SkillFileEntry | TreeNode) {
  if (entry.isDir) {
    toggleDir(entry as TreeNode)
    return
  }

  selectedPath.value = entry.path
  currentFileName.value = entry.name
  currentFileType.value = entry.fileType
  isLoadingFile.value = true
  currentFileContent.value = ''
  isEditMode.value = false

  try {
    const content = await invoke<string>('read_file_content', {
      filePath: entry.path,
    })
    currentFileContent.value = content
  } catch (error) {
    console.error('Failed to load file:', error)
  } finally {
    isLoadingFile.value = false
  }
}

// 加载 Skill 所有文件
async function loadSkillDetail() {
  isLoading.value = true
  selectedPath.value = null
  currentFileContent.value = ''
  isEditMode.value = false
  try {
    const entries = await invoke<SkillFileEntry[]>('list_skill_all_files', {
      skillPath: props.skill.skillPath,
    })
    allEntries.value = entries
    initTreeSelection()
  } catch (error) {
    console.error('Failed to load skill files:', error)
  } finally {
    isLoading.value = false
  }
}

// 切换编辑模式
function toggleEditMode() {
  if (isEditMode.value) {
    isEditMode.value = false
  } else {
    if (currentFile.value) {
      editContent.value = currentFile.value.content
      isEditMode.value = true
    }
  }
}

// 保存编辑（写回磁盘）
async function saveEdit() {
  if (!currentFile.value || isSaving.value) {
    return
  }

  isSaving.value = true
  try {
    await invoke('write_file_content', {
      filePath: currentFile.value.path,
      content: editContent.value,
    })
    currentFileContent.value = editContent.value
    isEditMode.value = false
  } catch (error) {
    console.error('Failed to save file:', error)
    notificationStore.databaseError(
      t('settings.skills.saveFailed', { defaultValue: '保存失败' }),
      getErrorMessage(error),
      async () => { await saveEdit() }
    )
  } finally {
    isSaving.value = false
  }
}

function handleBack() {
  emit('back')
}

function handleDelete() {
  emit('delete', props.skill)
}

function getFileIcon(fileType: string, isDir: boolean): string {
  if (isDir) return 'lucide:folder'
  switch (fileType) {
    case 'markdown':
      return 'lucide:file-text'
    case 'javascript':
    case 'typescript':
    case 'python':
    case 'rust':
    case 'html':
    case 'css':
      return 'lucide:file-code'
    case 'json':
      return 'lucide:file-json'
    default:
      return 'lucide:file'
  }
}

watch(() => props.skill, () => {
  loadSkillDetail()
}, { immediate: true })

onMounted(() => {
  loadSkillDetail()
})
</script>

<template>
  <div class="skill-detail">
    <!-- 头部工具栏 -->
    <div class="skill-detail__toolbar">
      <div class="skill-detail__toolbar-left">
        <EaButton
          variant="ghost"
          size="small"
          @click="handleBack"
        >
          <EaIcon name="lucide:arrow-left" />
          {{ t('common.back') }}
        </EaButton>
        <div class="skill-detail__breadcrumb">
          <EaIcon
            name="lucide:book-open"
            class="skill-detail__icon"
          />
          <span class="skill-detail__name">{{ skill.name }}</span>
          <EaIcon
            name="lucide:chevron-right"
            class="skill-detail__chevron"
          />
          <span class="skill-detail__current-file">{{ currentFileName || '—' }}</span>
        </div>
      </div>
      <div class="skill-detail__toolbar-right">
        <EaButton
          v-if="skill.source === 'file' && currentFile"
          :variant="isEditMode ? 'primary' : 'ghost'"
          size="small"
          :disabled="isSaving"
          @click="toggleEditMode"
        >
          <EaIcon :name="isEditMode ? 'lucide:eye' : 'lucide:pencil'" />
          {{ isEditMode ? t('common.view') : t('common.edit') }}
        </EaButton>

        <EaButton
          v-if="isEditMode"
          variant="primary"
          size="small"
          :loading="isSaving"
          @click="saveEdit"
        >
          <EaIcon name="lucide:save" />
          {{ t('common.save') }}
        </EaButton>

        <EaButton
          v-if="skill.source === 'file'"
          variant="ghost"
          size="small"
          danger
          @click="handleDelete"
        >
          <EaIcon name="lucide:trash-2" />
        </EaButton>
      </div>
    </div>

    <!-- 路径信息 -->
    <div class="skill-detail__path-bar">
      <EaIcon name="lucide:folder" />
      <span>{{ skill.skillPath }}</span>
    </div>

    <!-- 加载中 -->
    <div
      v-if="isLoading"
      class="skill-detail__loading"
    >
      <EaIcon
        name="lucide:loader-2"
        class="skill-detail__spinner"
      />
      {{ t('common.loading') }}
    </div>

    <!-- 主内容区域：左侧文件树 + 右侧文件内容 -->
    <div
      v-else
      class="skill-detail__body"
    >
      <!-- 左侧文件导航树 -->
      <aside class="skill-detail__tree">
        <div class="skill-detail__tree-header">
          <EaIcon
            name="lucide:folder-tree"
            :size="14"
          />
          <span>{{ t('settings.skills.files') }}</span>
        </div>
        <div class="skill-detail__tree-content">
          <button
            v-for="node in visibleNodes"
            :key="node.key"
            type="button"
            class="skill-detail__tree-item"
            :class="{
              'skill-detail__tree-item--active': !node.isDir && selectedPath === node.path,
              'skill-detail__tree-item--dir': node.isDir
            }"
            :style="{ paddingLeft: `calc(var(--spacing-2) + ${node.depth * 14}px)` }"
            @click="selectFile(node)"
          >
            <EaIcon
              v-if="node.isDir"
              :name="expandedDirs.has(node.relPath) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              :size="12"
              class="skill-detail__tree-chevron"
            />
            <EaIcon
              :name="getFileIcon(node.fileType, node.isDir)"
              :size="14"
              class="skill-detail__tree-icon"
            />
            <span class="skill-detail__tree-name">{{ node.name }}</span>
          </button>

          <div
            v-if="visibleNodes.length === 0"
            class="skill-detail__tree-empty"
          >
            {{ t('settings.skills.noContent') }}
          </div>
        </div>
      </aside>

      <!-- 右侧文件内容 -->
      <div class="skill-detail__main">
        <ConfigFileWorkspace
          :loading="isLoadingFile"
          :editing="isEditMode"
          :file="currentFile ? {
            name: currentFile.name,
            path: currentFile.path,
            content: currentFile.content,
            fileType: currentFile.file_type
          } : null"
          :edit-content="editContent"
          :edit-placeholder="t('settings.skills.editPlaceholder')"
          :empty-text="t('settings.skills.noContent')"
          max-width="900px"
          padding="var(--spacing-6)"
          @update:edit-content="editContent = $event"
          @save="saveEdit"
        >
          <template #loading>
            {{ t('common.loading') }}
          </template>
        </ConfigFileWorkspace>
      </div>
    </div>
  </div>
</template>
<style scoped src="./SkillDetailView.css"></style>
