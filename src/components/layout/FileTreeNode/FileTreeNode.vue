<script setup lang="ts">
import { useFileTreeNode, type FileTreeNodeEmits, type FileTreeNodeProps } from './useFileTreeNode'

const props = defineProps<FileTreeNodeProps>()
const emit = defineEmits<FileTreeNodeEmits>()

const {
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
} = useFileTreeNode(props, emit)
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
        <EaIcon
          name="loading"
          :size="12"
          class="file-tree-node__loading-icon"
        />
        <span>加载中...</span>
      </div>
      <!-- 子节点列表 -->
      <template v-else-if="nodeChildren.length > 0">
        <FileTreeNode
          v-for="child in nodeChildren"
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

<style scoped src="./styles.css"></style>
