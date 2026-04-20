<script setup lang="ts">
import { NTree } from 'naive-ui'
import { EaButton, EaIcon } from '@/components/common'
import FileTreeContextMenu from './FileTreeContextMenu.vue'
import FileTreeCreateDialog from './FileTreeCreateDialog.vue'
import FileTreeRenameDialog from './FileTreeRenameDialog.vue'
import { useFileTree, type FileTreeEmits, type FileTreeProps } from './useFileTree'

const props = defineProps<FileTreeProps>()
const emit = defineEmits<FileTreeEmits>()

const {
  t,
  loading,
  rootRef,
  searchInputRef,
  searchQuery,
  searchResults,
  searchActiveIndex,
  isSearchActive,
  isSearching,
  treeData,
  expandedKeys,
  contextMenuContext,
  renameDialogVisible,
  renameNode,
  createDialogVisible,
  createTargetNode,
  createEntryType,
  deleteConfirmVisible,
  deleteNode,
  batchDeleteConfirmVisible,
  selectedActionPaths,
  handleExpandChange,
  handleTreeRootContextMenu,
  handleRootClick,
  closeContextMenu,
  handleRename,
  confirmRename,
  handleCreateFile,
  handleCreateFolder,
  confirmCreate,
  handleDelete,
  confirmDelete,
  confirmBatchDelete,
  allowDrop,
  handleTreeDragStart,
  handleTreeDragOver,
  handleTreeDragLeave,
  handleTreeDragEnd,
  handleDrop,
  handleSendToSession,
  handleSearchInputEvent,
  handleSearchKeydown,
  selectSearchResult,
  clearSearch,
  renderLabel,
  resolveNodeProps
} = useFileTree(props, emit)
</script>

<template>
  <div
    ref="rootRef"
    class="file-tree"
    tabindex="0"
    @click="handleRootClick"
    @contextmenu="handleTreeRootContextMenu"
  >
    <div class="file-tree__search">
      <div class="file-tree__search-input-shell">
        <EaIcon
          name="search"
          :size="13"
          class="file-tree__search-icon"
        />
        <input
          ref="searchInputRef"
          :value="searchQuery"
          class="file-tree__search-input"
          type="text"
          :placeholder="t('fileTree.searchPlaceholder')"
          @input="handleSearchInputEvent"
          @keydown="handleSearchKeydown"
        >
        <button
          v-if="searchQuery"
          type="button"
          class="file-tree__search-clear"
          :title="t('fileTree.clearSearch')"
          @click="clearSearch"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>
    </div>

    <div
      v-if="isSearchActive"
      class="file-tree__search-results"
    >
      <div
        v-if="isSearching"
        class="file-tree__search-empty"
      >
        {{ t('fileTree.searching') }}
      </div>
      <template v-else-if="searchResults.length > 0">
        <button
          v-for="(item, index) in searchResults"
          :key="item.path"
          type="button"
          :class="['file-tree__search-item', { 'file-tree__search-item--active': index === searchActiveIndex }]"
          @click="selectSearchResult(item)"
        >
          <EaIcon
            :name="item.nodeType === 'directory' ? 'folder' : 'file-code'"
            :size="14"
            class="file-tree__search-item-icon"
          />
          <span class="file-tree__search-item-name">{{ item.name }}</span>
          <span class="file-tree__search-item-path">{{ item.displayPath }}</span>
        </button>
      </template>
      <div
        v-else
        class="file-tree__search-empty"
      >
        {{ t('fileTree.noSearchResults') }}
      </div>
    </div>

    <n-tree
      v-show="!isSearchActive"
      :data="treeData"
      :expanded-keys="expandedKeys"
      virtual-scroll
      draggable
      :selectable="false"
      block-line
      :allow-drop="allowDrop"
      :render-label="renderLabel"
      :node-props="resolveNodeProps"
      :override-default-node-click-behavior="() => 'none'"
      class="file-tree__n-tree"
      @update:expanded-keys="handleExpandChange"
      @dragstart="handleTreeDragStart"
      @dragover="handleTreeDragOver"
      @dragleave="handleTreeDragLeave"
      @dragend="handleTreeDragEnd"
      @drop="handleDrop"
    />

    <FileTreeContextMenu
      :context="contextMenuContext"
      @create-file="handleCreateFile"
      @create-folder="handleCreateFolder"
      @rename="handleRename"
      @delete="handleDelete"
      @send-to-session="handleSendToSession"
      @close="closeContextMenu"
    />

    <FileTreeCreateDialog
      v-model:visible="createDialogVisible"
      :node="createTargetNode"
      :entry-type="createEntryType"
      @confirm="confirmCreate"
      @cancel="createDialogVisible = false"
    />

    <FileTreeRenameDialog
      v-model:visible="renameDialogVisible"
      :node="renameNode"
      @confirm="confirmRename"
      @cancel="renameDialogVisible = false"
    />

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="deleteConfirmVisible"
          class="modal-overlay"
          @click="deleteConfirmVisible = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('fileTree.confirmDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('fileTree.confirmDeleteMessage', { name: deleteNode?.label }) }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="deleteConfirmVisible = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                :loading="loading"
                @click="confirmDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="batchDeleteConfirmVisible"
          class="modal-overlay"
          @click="batchDeleteConfirmVisible = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('fileTree.confirmBatchDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('fileTree.confirmBatchDeleteMessage', { count: selectedActionPaths.length }) }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="batchDeleteConfirmVisible = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                :loading="loading"
                @click="confirmBatchDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped src="./styles.css"></style>
