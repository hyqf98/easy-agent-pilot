<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileTreeNode } from '@/stores/project'
import { useProjectStore } from '@/stores/project'
import { EaIcon } from '@/components/common'

interface Props {
  node: FileTreeNode
  depth: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'select-file': [path: string]
}>()

const projectStore = useProjectStore()
const isExpanded = ref(false)
const isLoadingChildren = ref(false)

const isDirectory = computed(() => props.node.nodeType === 'directory')

const toggleExpand = async (event: Event) => {
  event.stopPropagation()
  if (isDirectory.value) {
    isExpanded.value = !isExpanded.value

    // 展开时懒加载子节点
    if (isExpanded.value && (!props.node.children || props.node.children.length === 0)) {
      isLoadingChildren.value = true
      try {
        const children = await projectStore.loadDirectoryChildren(props.node.path)
        // 更新节点的 children
        props.node.children = children
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

  const ext = node.extension?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'file-code'
    case 'js':
    case 'jsx':
      return 'file-code'
    case 'vue':
      return 'file-code'
    case 'json':
      return 'file-json'
    case 'md':
      return 'file-text'
    case 'css':
    case 'scss':
    case 'less':
      return 'file-code'
    case 'html':
      return 'file-code'
    case 'py':
      return 'file-code'
    case 'rs':
      return 'file-code'
    case 'go':
      return 'file-code'
    case 'java':
      return 'file-code'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return 'image'
    default:
      return 'file'
  }
}

// 获取文件图标颜色
const getFileIconColor = (node: FileTreeNode): string => {
  if (node.nodeType === 'directory') {
    return 'var(--color-text-secondary)'
  }

  const ext = node.extension?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '#3178c6'
    case 'js':
    case 'jsx':
      return '#f7df1e'
    case 'vue':
      return '#42b883'
    case 'json':
      return '#cbcb41'
    case 'md':
      return '#519aba'
    case 'py':
      return '#3776ab'
    case 'rs':
      return '#dea584'
    case 'go':
      return '#00add8'
    case 'java':
      return '#b07219'
    default:
      return 'var(--color-text-tertiary)'
  }
}

const indentStyle = computed(() => ({
  paddingLeft: `${props.depth * 12 + 8}px`
}))
</script>

<template>
  <div class="file-tree-node">
    <!-- 节点内容 -->
    <div
      :class="['file-tree-node__content', { 'file-tree-node__content--file': !isDirectory }]"
      :style="indentStyle"
      @click="isDirectory ? toggleExpand($event) : handleSelectFile($event)"
    >
      <!-- 展开/折叠箭头 -->
      <span
        v-if="isDirectory"
        class="file-tree-node__arrow"
        :class="{ 'file-tree-node__arrow--expanded': isExpanded }"
      >
        <EaIcon
          name="chevron-right"
          :size="12"
        />
      </span>
      <span
        v-else
        class="file-tree-node__arrow-placeholder"
      />

      <!-- 图标 -->
      <EaIcon
        :name="getFileIcon(node)"
        :size="14"
        class="file-tree-node__icon"
        :style="{ color: getFileIconColor(node) }"
      />

      <!-- 名称 -->
      <span class="file-tree-node__name">
        {{ node.name }}
      </span>
    </div>

    <!-- 子节点 -->
    <div
      v-if="isDirectory && isExpanded"
      class="file-tree-node__children"
    >
      <!-- 加载中状态 -->
      <div
        v-if="isLoadingChildren"
        class="file-tree-node__loading"
        :style="{ paddingLeft: `${(depth + 1) * 12 + 8}px` }"
      >
        <EaIcon name="loading" :size="12" class="file-tree-node__loading-icon" />
        <span>加载中...</span>
      </div>
      <!-- 子节点列表 -->
      <template v-else-if="node.children && node.children.length > 0">
        <FileTreeNode
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
          @select-file="(path: string) => emit('select-file', path)"
        />
      </template>
      <!-- 空目录 -->
      <div
        v-else
        class="file-tree-node__empty"
        :style="{ paddingLeft: `${(depth + 1) * 12 + 8}px` }"
      >
        <span>空目录</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree-node {
  user-select: none;
}

.file-tree-node__content {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.file-tree-node__content:hover {
  background-color: var(--color-surface-hover);
}

.file-tree-node__content--file {
  cursor: pointer;
}

.file-tree-node__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  transition: transform var(--transition-fast) var(--easing-default);
}

.file-tree-node__arrow--expanded {
  transform: rotate(90deg);
}

.file-tree-node__arrow-placeholder {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.file-tree-node__icon {
  flex-shrink: 0;
}

.file-tree-node__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.file-tree-node__children {
  /* 子节点容器 */
}

.file-tree-node__loading {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: var(--spacing-1) var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.file-tree-node__loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.file-tree-node__empty {
  padding: var(--spacing-1) var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-style: italic;
}
</style>
