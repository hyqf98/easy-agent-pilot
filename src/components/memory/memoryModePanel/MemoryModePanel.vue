<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaInput } from '@/components/common'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import WorkspaceShell from '@/components/layout/WorkspaceShell/WorkspaceShell.vue'
import MemoryMarkdownEditor from '../MemoryMarkdownEditor.vue'
import MemoryLibraryModal from '../MemoryLibraryModal.vue'
import RawMemoryModal from '../RawMemoryModal.vue'
import MemoryMergeModal from '../MemoryMergeModal.vue'
import MemoryBatchDeleteModal from '../MemoryBatchDeleteModal.vue'
import MemoryAuthoringDialog from '../MemoryAuthoringDialog.vue'
import { useMemoryModePanel } from './useMemoryModePanel'

const { t } = useI18n()
const createLibraryMenuRef = ref<HTMLElement | null>(null)
const createLibraryMenuVisible = ref(false)

const {
  memoryStore,
  search,
  projectFilter,
  selectedRecordId,
  selectedRecord,
  projectOptions,
  currentProjectLabel,
  sortedLibraries,
  canSaveLibrary,
  canExportLibrary,
  libraryModalVisible,
  libraryEditing,
  rawModalVisible,
  rawEditing,
  mergeModalVisible,
  batchDeleteModalVisible,
  libraryContentDraft,
  memoryAuthoringDialog,
  reloadRawRecords,
  openLibraryCreate,
  openAiLibraryCreate,
  openAiLibraryCreateFromSelection,
  openLibraryEdit,
  openRawCreate,
  openRawEdit,
  handleLibrarySubmit,
  handleRawSubmit,
  handleDeleteLibrary,
  handleDeleteRecord,
  handleBatchDeleteConfirm,
  handleSaveLibrary,
  importLibraryMarkdown,
  exportLibraryMarkdown,
  handleMergeConfirm
} = useMemoryModePanel()

function handleCreateLibraryAction(action: 'manual' | 'ai') {
  createLibraryMenuVisible.value = false
  if (action === 'manual') {
    openLibraryCreate()
    return
  }

  void openAiLibraryCreate()
}

function toggleCreateLibraryMenu() {
  createLibraryMenuVisible.value = !createLibraryMenuVisible.value
}

useSafeOutsideClick(
  () => [createLibraryMenuRef.value],
  () => {
    createLibraryMenuVisible.value = false
  }
)
</script>

<template>
  <div class="memory-mode">
    <WorkspaceShell
      :sidebar-width="300"
      :sidebar-min="240"
      :sidebar-max="420"
    >
      <template #sidebar>
        <aside class="memory-mode__libraries">
          <div class="memory-panel-heading">
            <div class="memory-panel-heading__content">
              <p class="memory-panel-heading__eyebrow">
                {{ t('memory.workspace.librariesEyebrow') }}
              </p>
              <h2>{{ t('memory.workspace.librariesTitle') }}</h2>
            </div>
            <div
              ref="createLibraryMenuRef"
              class="memory-create-menu"
            >
              <button
                type="button"
                class="memory-create-button"
                :aria-label="t('memory.workspace.createLibrary')"
                :aria-expanded="createLibraryMenuVisible"
                @click="toggleCreateLibraryMenu"
              >
                <EaIcon
                  name="plus"
                  :size="16"
                />
              </button>

              <div
                v-if="createLibraryMenuVisible"
                class="memory-create-menu__dropdown"
              >
                <button
                  type="button"
                  class="memory-create-menu__item"
                  @click="handleCreateLibraryAction('manual')"
                >
                  {{ t('memory.workspace.createManual') }}
                </button>
                <button
                  type="button"
                  class="memory-create-menu__item"
                  @click="handleCreateLibraryAction('ai')"
                >
                  {{ t('memory.workspace.createAi') }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="memoryStore.isLoadingLibraries && !memoryStore.libraries.length"
            class="memory-empty"
          >
            {{ t('memory.workspace.librariesLoading') }}
          </div>

          <div
            v-else-if="!sortedLibraries.length"
            class="memory-empty"
          >
            {{ t('memory.workspace.librariesEmpty') }}
          </div>

          <div
            v-else
            class="memory-library-list"
          >
            <button
              v-for="library in sortedLibraries"
              :key="library.id"
              type="button"
              class="memory-library-card"
              :class="{ 'memory-library-card--active': library.id === memoryStore.activeLibraryId }"
              @click="memoryStore.setActiveLibrary(library.id)"
            >
              <div class="memory-library-card__head">
                <div>
                  <strong>{{ library.name }}</strong>
                  <p>{{ library.description || t('memory.workspace.emptyDescription') }}</p>
                </div>
                <span>{{ new Date(library.updatedAt).toLocaleDateString() }}</span>
              </div>
              <div class="memory-library-card__foot">
                <button
                  type="button"
                  class="memory-inline-action"
                  @click.stop="openLibraryEdit(library)"
                >
                  {{ t('memory.workspace.edit') }}
                </button>
                <button
                  type="button"
                  class="memory-inline-action memory-inline-action--danger"
                  @click.stop="handleDeleteLibrary(library)"
                >
                  {{ t('memory.workspace.delete') }}
                </button>
              </div>
            </button>
          </div>
        </aside>
      </template>

      <div class="memory-content">
        <section class="memory-mode__records">
          <div class="memory-panel-heading">
            <div>
              <p class="memory-panel-heading__eyebrow">
                {{ t('memory.workspace.recordsEyebrow') }}
              </p>
              <h2>{{ t('memory.workspace.recordsTitle') }}</h2>
            </div>
            <div class="memory-toolbar__actions">
              <EaButton
                type="secondary"
                size="small"
                @click="openRawCreate"
              >
                {{ t('memory.workspace.addRaw') }}
              </EaButton>
              <EaButton
                type="secondary"
                size="small"
                @click="reloadRawRecords"
              >
                {{ t('memory.workspace.refresh') }}
              </EaButton>
              <EaButton
                type="danger"
                size="small"
                @click="batchDeleteModalVisible = true"
              >
                {{ t('memory.workspace.batchDelete') }}
              </EaButton>
            </div>
          </div>

          <div class="memory-filters">
            <EaInput
              v-model="search"
              :placeholder="t('memory.workspace.searchRawPlaceholder')"
            />
            <EaSelect
              v-model="projectFilter"
              :options="projectOptions"
            />
          </div>

          <div class="memory-records-toolbar">
            <div class="memory-records-toolbar__summary">
              <span>{{ t('memory.workspace.totalRecords', { count: memoryStore.rawRecords.length }) }}</span>
              <span v-if="memoryStore.selectedRecordIds.length">{{ t('memory.workspace.selectedRecords', { count: memoryStore.selectedRecordIds.length }) }}</span>
            </div>
            <div class="memory-toolbar__actions">
              <EaButton
                type="ghost"
                size="small"
                :disabled="memoryStore.selectedRecordIds.length === 0"
                @click="memoryStore.clearSelectedRecords()"
              >
                {{ t('memory.workspace.clearSelected') }}
              </EaButton>
              <EaButton
                type="secondary"
                size="small"
                :disabled="memoryStore.selectedRecordIds.length === 0"
                @click="openAiLibraryCreateFromSelection"
              >
                {{ t('memory.workspace.createFromSelection') }}
              </EaButton>
              <EaButton
                size="small"
                :disabled="memoryStore.selectedRecordIds.length === 0 || !memoryStore.libraries.length"
                :loading="memoryStore.isMerging"
                @click="mergeModalVisible = true"
              >
                {{ t('memory.workspace.mergeToLibrary') }}
              </EaButton>
            </div>
          </div>

          <div
            v-if="selectedRecord"
            class="memory-record-preview"
          >
            <div class="memory-record-preview__head">
              <div>
                <strong>{{ t('memory.workspace.currentPreview') }}</strong>
                <span>{{ selectedRecord.projectName || t('memory.workspace.unlinkedProject') }} / {{ selectedRecord.sessionName || t('memory.workspace.unlinkedSession') }}</span>
              </div>
              <div class="memory-toolbar__actions">
                <EaButton
                  type="secondary"
                  size="small"
                  @click="openRawEdit(selectedRecord)"
                >
                  {{ t('memory.workspace.edit') }}
                </EaButton>
                <EaButton
                  type="danger"
                  size="small"
                  @click="handleDeleteRecord(selectedRecord)"
                >
                  {{ t('memory.workspace.delete') }}
                </EaButton>
              </div>
            </div>
            <pre>{{ selectedRecord.content }}</pre>
          </div>

          <div
            v-if="memoryStore.isLoadingRecords && !memoryStore.rawRecords.length"
            class="memory-empty"
          >
            {{ t('memory.workspace.recordsLoading') }}
          </div>

          <div
            v-else-if="!memoryStore.rawRecords.length"
            class="memory-empty"
          >
            {{ t('memory.workspace.recordsEmpty') }}
          </div>

          <div
            v-else
            class="memory-record-list"
          >
            <article
              v-for="record in memoryStore.rawRecords"
              :key="record.id"
              class="memory-record-card"
              :class="{ 'memory-record-card--active': record.id === selectedRecordId }"
              @click="selectedRecordId = record.id"
            >
              <label
                class="memory-record-card__check"
                @click.stop
              >
                <input
                  type="checkbox"
                  :checked="memoryStore.selectedRecordIds.includes(record.id)"
                  @change="memoryStore.toggleRecordSelection(record.id)"
                >
                <span>{{ new Date(record.createdAt).toLocaleString() }}</span>
              </label>

              <div class="memory-record-card__content">
                <p>{{ record.content }}</p>
              </div>

              <div class="memory-record-card__meta">
                <span>{{ record.projectName || t('memory.workspace.unlinkedProject') }}</span>
                <span>{{ record.sessionName || t('memory.workspace.unlinkedSession') }}</span>
              </div>
            </article>
          </div>
        </section>

        <aside class="memory-mode__library-editor">
          <div class="memory-panel-heading">
            <div>
              <p class="memory-panel-heading__eyebrow">
                {{ t('memory.workspace.editorEyebrow') }}
              </p>
              <h2>{{ memoryStore.activeLibrary?.name || t('memory.workspace.selectLibrary') }}</h2>
              <p class="memory-library-editor__desc">
                {{ memoryStore.activeLibrary?.description || t('memory.workspace.libraryEditorFallback') }}
              </p>
            </div>
          </div>

          <div
            v-if="!memoryStore.activeLibrary"
            class="memory-empty"
          >
            {{ t('memory.workspace.editorEmpty') }}
          </div>

          <template v-else>
            <div class="memory-library-editor__toolbar">
              <span>{{ t('memory.workspace.updatedAt', { time: new Date(memoryStore.activeLibrary.updatedAt).toLocaleString() }) }}</span>
              <div class="memory-toolbar__actions">
                <EaButton
                  type="secondary"
                  size="small"
                  @click="importLibraryMarkdown"
                >
                  {{ t('memory.workspace.importMarkdown') }}
                </EaButton>
                <EaButton
                  type="secondary"
                  size="small"
                  :disabled="!canExportLibrary"
                  @click="exportLibraryMarkdown"
                >
                  {{ t('memory.workspace.exportMarkdown') }}
                </EaButton>
                <EaButton
                  size="small"
                  :disabled="!canSaveLibrary"
                  :loading="memoryStore.isSavingLibrary"
                  @click="handleSaveLibrary"
                >
                  {{ t('memory.workspace.saveMarkdown') }}
                </EaButton>
              </div>
            </div>

            <MemoryMarkdownEditor
              v-model="libraryContentDraft"
              :placeholder="t('memory.workspace.textareaPlaceholder')"
            />

            <section class="memory-merge-history">
              <div class="memory-merge-history__head">
                <strong>{{ t('memory.workspace.mergeHistory') }}</strong>
                <span v-if="memoryStore.isLoadingMergeRuns">{{ t('memory.workspace.loading') }}</span>
              </div>

              <div
                v-if="!memoryStore.mergeRuns.length"
                class="memory-merge-history__empty"
              >
                {{ t('memory.workspace.mergeHistoryEmpty') }}
              </div>

              <div
                v-else
                class="memory-merge-history__list"
              >
                <article
                  v-for="run in memoryStore.mergeRuns.slice(0, 6)"
                  :key="run.id"
                  class="memory-merge-history__item"
                >
                  <div class="memory-merge-history__meta">
                    <span>{{ new Date(run.createdAt).toLocaleString() }}</span>
                    <span>{{ t('memory.workspace.sourceRecordsCount', { count: run.sourceRecordCount }) }}</span>
                  </div>
                  <p>{{ run.agentId || t('memory.workspace.agentFallback') }} / {{ run.modelId || t('memory.workspace.modelFallback') }}</p>
                </article>
              </div>
            </section>
          </template>
        </aside>
      </div>

      <MemoryLibraryModal
        v-model:visible="libraryModalVisible"
        :library="libraryEditing"
        :loading="memoryStore.isSavingLibrary"
        @submit="handleLibrarySubmit"
      />

      <RawMemoryModal
        v-model:visible="rawModalVisible"
        :record="rawEditing"
        @submit="handleRawSubmit"
      />

      <MemoryMergeModal
        v-model:visible="mergeModalVisible"
        :libraries="memoryStore.libraries"
        :selected-count="memoryStore.selectedRecordIds.length"
        :current-library-id="memoryStore.activeLibraryId"
        :loading="memoryStore.isMerging"
        @confirm="handleMergeConfirm"
      />

      <MemoryBatchDeleteModal
        v-model:visible="batchDeleteModalVisible"
        :visible-count="memoryStore.rawRecords.length"
        :project-label="currentProjectLabel"
        :search-keyword="search.trim()"
        :loading="memoryStore.isDeletingRecords"
        @confirm="handleBatchDeleteConfirm"
      />

      <MemoryAuthoringDialog :dialog="memoryAuthoringDialog" />
    </WorkspaceShell>
  </div>
</template>
<style scoped src="./styles.css"></style>
