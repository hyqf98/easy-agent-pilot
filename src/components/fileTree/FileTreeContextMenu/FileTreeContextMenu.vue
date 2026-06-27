<script setup lang="ts">
import { EaIcon } from '@/components/common'
import {
  useFileTreeContextMenu,
  type FileTreeContextMenuEmits,
  type FileTreeContextMenuProps
} from './useFileTreeContextMenu'

const props = defineProps<FileTreeContextMenuProps>()
const emit = defineEmits<FileTreeContextMenuEmits>()

const {
  t,
  menuStyle,
  visible,
  nodeType,
  isRoot,
  handleCreateFile,
  handleCreateFolder,
  handleRename,
  handleDelete,
  handleSendToSession
} = useFileTreeContextMenu(props, emit)
</script>

<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="visible"
        class="file-tree-context-menu"
        :style="menuStyle"
        @click.stop
      >
        <div
          v-if="!isRoot"
          class="context-menu__item"
          @click="handleSendToSession"
        >
          <EaIcon
            name="at-sign"
            :size="14"
            class="context-menu__icon"
          />
          <span>{{ t('fileTree.sendToSession') }}</span>
        </div>
        <div
          class="context-menu__item"
          @click="handleCreateFile"
        >
          <EaIcon
            name="file-plus"
            :size="14"
            class="context-menu__icon"
          />
          <span>{{ t('fileTree.createFile') }}</span>
        </div>
        <div
          class="context-menu__item"
          @click="handleCreateFolder"
        >
          <EaIcon
            name="folder-plus"
            :size="14"
            class="context-menu__icon"
          />
          <span>{{ t('fileTree.createFolder') }}</span>
        </div>
        <div class="context-menu__divider" />
        <div
          v-if="!isRoot"
          class="context-menu__item"
          @click="handleRename"
        >
          <EaIcon
            name="edit-2"
            :size="14"
            class="context-menu__icon"
          />
          <span>{{ t('common.rename') }}</span>
        </div>
        <div
          v-if="!isRoot"
          class="context-menu__item context-menu__item--danger"
          @click="handleDelete"
        >
          <EaIcon
            :name="nodeType === 'directory' ? 'folder-minus' : 'trash-2'"
            :size="14"
            class="context-menu__icon"
          />
          <span>{{ nodeType === 'directory' ? t('common.deleteFolder') : t('common.deleteFile') }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>
