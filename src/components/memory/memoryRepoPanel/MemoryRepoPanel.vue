<script setup lang="ts">
import { useMemoryRepoPanel, type RepoDetailTab } from './useMemoryRepoPanel'
import { EaButton, EaIcon } from '@/components/common'
import WorkspaceShell from '@/components/layout/WorkspaceShell/WorkspaceShell.vue'
import RepoOverviewTab from './overviewTab/RepoOverviewTab.vue'
import RepoFilesTab from './filesTab/RepoFilesTab.vue'
import RepoRunTab from './runTab/RepoRunTab.vue'
import RepoSourcesTab from './sourcesTab/RepoSourcesTab.vue'
import RepoJobsTab from './jobsTab/RepoJobsTab.vue'
import RepoCreateModal from './repoCreateModal/RepoCreateModal.vue'
import RepoEditModal from './repoEditModal/RepoEditModal.vue'

const {
  t,
  memoryRepoStore,
  activeTab,
  createModal,
  editModal,
  activeRepo,
  sortedRepos,
  openCreateModal,
  selectRepo,
  openEditModal,
  handleCreate,
  handleEditSubmit,
  handleDelete,
  handleMigrateLegacy
} = useMemoryRepoPanel()

const tabs: Array<{ key: RepoDetailTab; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'files', label: '文件' },
  { key: 'sources', label: '数据源' },
  { key: 'run', label: '归纳' },
  { key: 'jobs', label: '任务' }
]
</script>

<template>
  <WorkspaceShell :sidebar-width="300">
    <template #sidebar="{ hide }">
      <div class="repo-panel__sidebar">
        <div class="repo-panel__sidebar-header">
          <span class="repo-panel__sidebar-title">{{ t('memoryRepo.title') }}</span>
          <EaButton
            variant="ghost"
            size="small"
            @click="hide"
          >
            <EaIcon
              name="panel-left-close"
              :size="15"
            />
          </EaButton>
        </div>

        <div class="repo-panel__sidebar-actions">
          <EaButton
            variant="primary"
            size="small"
            @click="openCreateModal"
          >
            <EaIcon
              name="lucide:plus"
              :size="14"
            />
            {{ t('memoryRepo.create') }}
          </EaButton>
          <EaButton
            variant="ghost"
            size="small"
            @click="handleMigrateLegacy"
          >
            <EaIcon
              name="lucide:download"
              :size="14"
            />
            {{ t('memoryRepo.migrate') }}
          </EaButton>
        </div>

        <div class="repo-panel__list">
          <div
            v-if="sortedRepos.length === 0 && !memoryRepoStore.isLoadingRepos"
            class="repo-panel__list-empty"
          >
            {{ t('memoryRepo.empty') }}
          </div>
          <button
            v-for="repo in sortedRepos"
            :key="repo.id"
            type="button"
            class="repo-panel__card"
            :class="{ 'repo-panel__card--active': activeRepo?.id === repo.id }"
            @click="selectRepo(repo.id)"
          >
            <div class="repo-panel__card-header">
              <EaIcon
                :name="repo.format === 'single' ? 'lucide:file-text' : 'lucide:package'"
                :size="14"
              />
              <span class="repo-panel__card-name">{{ repo.name }}</span>
            </div>
            <p
              v-if="repo.description"
              class="repo-panel__card-desc"
            >
              {{ repo.description }}
            </p>
            <span class="repo-panel__card-meta">{{ repo.slug }}</span>
          </button>
        </div>
      </div>
    </template>

    <div
      v-if="!activeRepo"
      class="repo-panel__placeholder"
    >
      <EaIcon
        name="lucide:package"
        :size="40"
      />
      <p>{{ t('memoryRepo.placeholder') }}</p>
    </div>

    <div
      v-else
      class="repo-panel__detail"
    >
      <header class="repo-panel__detail-header">
        <nav class="repo-panel__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="repo-panel__tab"
            :class="{ 'repo-panel__tab--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>
        <div class="repo-panel__detail-actions">
          <EaButton
            variant="ghost"
            size="small"
            @click="openEditModal"
          >
            <EaIcon
              name="lucide:pencil"
              :size="14"
            />
            {{ t('common.edit') }}
          </EaButton>
          <EaButton
            variant="ghost"
            size="small"
            danger
            @click="handleDelete"
          >
            <EaIcon
              name="lucide:trash-2"
              :size="14"
            />
          </EaButton>
        </div>
      </header>

      <div class="repo-panel__detail-body">
        <RepoOverviewTab v-show="activeTab === 'overview'" />
        <RepoFilesTab v-if="activeTab === 'files'" />
        <RepoSourcesTab v-if="activeTab === 'sources'" />
        <RepoRunTab v-if="activeTab === 'run'" />
        <RepoJobsTab v-if="activeTab === 'jobs'" />
      </div>
    </div>

    <RepoCreateModal
      :visible="createModal.isVisible.value"
      :loading="memoryRepoStore.isSavingRepo"
      @update:visible="createModal.isVisible.value = $event"
      @submit="handleCreate"
    />
    <RepoEditModal
      :visible="editModal.isVisible.value"
      :loading="memoryRepoStore.isSavingRepo"
      @update:visible="editModal.isVisible.value = $event"
      @submit="handleEditSubmit"
    />
  </WorkspaceShell>
</template>

<style scoped src="./styles.css"></style>
