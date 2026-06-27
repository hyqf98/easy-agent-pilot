import { computed, ref } from 'vue'
import type { FileTreeNode } from '@/stores/project'
import { useProjectStore } from '@/stores/project'
import { EaIcon } from '@/components/common'
import { resolveFileIcon } from '@/utils/fileIcon'

export interface FileTreeNodeProps {
  node: FileTreeNode
  depth: number
}

export interface FileTreeNodeEmits {
  (event: 'select-file', path: string): void
}

export function useFileTreeNode(props: FileTreeNodeProps, emit: FileTreeNodeEmits) {
  const projectStore = useProjectStore()
  const isExpanded = ref(false)
  const isLoadingChildren = ref(false)
  const currentChildren = ref<FileTreeNode[]>(props.node.children || [])

  const isDirectory = computed(() => props.node.nodeType === 'directory')

  const nodeChildren = computed(() => currentChildren.value)

  const toggleExpand = async (event: Event) => {
    event.stopPropagation()
    if (isDirectory.value) {
      isExpanded.value = !isExpanded.value

      if (isExpanded.value) {
        isLoadingChildren.value = true
        try {
          // 每次展开目录都实时查询，避免使用本地缓存
          currentChildren.value = await projectStore.loadDirectoryChildren(props.node.path)
        } finally {
          isLoadingChildren.value = false
        }
      }
    }
  }

  const handleSelectFile = (event: Event) => {
    event.stopPropagation()
    if (!isDirectory.value) {
      emit('select-file', props.node.path)
    }
  }

  // 获取文件图标
  const getFileIcon = (node: FileTreeNode): string => {
    if (node.nodeType === 'directory') {
      return isExpanded.value ? 'folder-open' : 'folder'
    }
    return resolveFileIcon(node.nodeType, node.name, node.extension).icon
  }

  // 获取文件图标颜色
  const getFileIconColor = (node: FileTreeNode): string => {
    if (node.nodeType === 'directory') {
      return 'var(--color-text-secondary)'
    }
    return resolveFileIcon(node.nodeType, node.name, node.extension).color
  }

  const indentStyle = computed(() => ({
    paddingLeft: `${props.depth * 12 + 8}px`
  }))

  return {
    isExpanded,
    isLoadingChildren,
    nodeChildren,
    isDirectory,
    toggleExpand,
    handleSelectFile,
    getFileIcon,
    getFileIconColor,
    indentStyle,
    EaIcon
  }
}
