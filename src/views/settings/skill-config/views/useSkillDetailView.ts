/**
 * useSkillDetailView — Skill 详情页（文件树浏览 + 文件编辑）的全部业务逻辑。
 *
 * 职责：
 * 1. 调用 invoke('list_skill_all_files') 获取 Skill 目录下全部文件条目；
 * 2. 将扁平条目构建为树形结构，并按展开状态扁平化后供模板渲染；
 * 3. 默认展开顶层目录并选中 SKILL.md；
 * 4. 点击文件时 invoke('read_file_content') 加载内容，支持切到编辑模式；
 * 5. 编辑模式下通过 invoke('write_file_content') 写回磁盘，失败时弹错误重试框；
 * 6. emit back / delete 事件交由父组件处理。
 */
import { ref, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import { EaButton, EaIcon } from '@/components/common'
import ConfigFileWorkspace from '@/views/settings/skill-config/common/ConfigFileWorkspace.vue'

// Skill 目录条目（递归）
interface SkillFileEntry {
  name: string
  path: string
  relPath: string
  isDir: boolean
  fileType: string
}

/** 组件 Props */
export interface SkillDetailViewProps {
  skill: UnifiedSkillConfig
}

/** 组件 Emits */
export interface SkillDetailViewEmits {
  (e: 'back'): void
  (e: 'delete', skill: UnifiedSkillConfig): void
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface SkillDetailViewEmitFn {
  (e: 'back'): void
  (e: 'delete', skill: UnifiedSkillConfig): void
}

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

// 扁平化可见节点（考虑展开状态），用于 v-for 渲染
interface FlatNode extends TreeNode {}

/**
 * SkillDetailView 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useSkillDetailView(
  props: SkillDetailViewProps,
  emit: SkillDetailViewEmitFn
) {
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

  return {
    // 子组件
    EaButton,
    EaIcon,
    ConfigFileWorkspace,
    // i18n
    t,
    // 状态
    isLoading,
    isEditMode,
    editContent,
    isSaving,
    selectedPath,
    currentFileName,
    isLoadingFile,
    expandedDirs,
    visibleNodes,
    currentFile,
    // 方法
    selectFile,
    toggleEditMode,
    saveEdit,
    handleBack,
    handleDelete,
    getFileIcon
  }
}
