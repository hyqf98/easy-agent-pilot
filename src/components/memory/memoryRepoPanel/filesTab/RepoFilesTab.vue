<script setup lang="ts">
import { useRepoFilesTab } from './useRepoFilesTab'
import { FileTree } from '@/components/fileTree'
import { FileEditorWorkspace } from '@/modules/fileEditor'

const {
  activeRepo,
  treeWidth,
  isResizing,
  startResize,
  handleFileSelect
} = useRepoFilesTab()
</script>

<template>
  <div
    v-if="activeRepo"
    class="repo-files-tab"
  >
    <div
      class="repo-files-tab__tree-pane"
      :style="{ width: `${treeWidth}px` }"
    >
      <FileTree
        :project-id="activeRepo.id"
        :project-path="activeRepo.repoPath"
        class="repo-files-tab__tree"
        @file-select="handleFileSelect"
      />
    </div>

    <div
      class="repo-files-tab__resizer"
      :class="{ 'repo-files-tab__resizer--active': isResizing }"
      @mousedown.prevent="startResize"
    />

    <div class="repo-files-tab__editor-pane">
      <FileEditorWorkspace compact />
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
