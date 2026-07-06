<script setup lang="ts">
import { useSkillDetailView, type SkillDetailViewProps, type SkillDetailViewEmits } from './useSkillDetailView'

const props = defineProps<SkillDetailViewProps>()
const emit = defineEmits<SkillDetailViewEmits>()

const {
  EaButton,
  EaIcon,
  ConfigFileWorkspace,
  t,
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
  selectFile,
  toggleEditMode,
  saveEdit,
  handleBack,
  handleDelete,
  getFileIcon
} = useSkillDetailView(props, emit)
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
