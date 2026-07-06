<script setup lang="ts">
/**
 * MemoryRepoPanel — 记忆库仓库面板骨架。
 * 仅负责模板渲染与 composable 胶水装配，全部逻辑见 useMemoryRepoPanel.ts。
 */
import { useMemoryRepoPanel } from './useMemoryRepoPanel'

const {
  EaButton,
  EaIcon,
  EaSidebarSectionHeader,
  WorkspaceShell,
  RepoOverviewTab,
  RepoFilesTab,
  RepoRunTab,
  RepoSourcesTab,
  RepoJobsTab,
  RepoCreateModal,
  RepoEditModal,
  t,
  memoryRepoStore,
  activeTab,
  tabs,
  createModal,
  editModal,
  activeRepo,
  sortedRepos,
  openCreateModal,
  selectRepo,
  openEditModal,
  handleCreate,
  handleEditSubmit,
  handleDelete
} = useMemoryRepoPanel()
</script>

<template>
  <WorkspaceShell :sidebar-width="300">
    <template #sidebar="{ hide }">
      <div class="repo-panel__sidebar">
        <EaSidebarSectionHeader
          :title="t('memoryRepo.title')"
          :create-title="t('memoryRepo.create')"
          @create="openCreateModal"
          @hide="hide"
        />

        <div class="repo-panel__list">
          <div
            v-if="sortedRepos.length === 0 && !memoryRepoStore.isLoadingRepos"
            class="repo-panel__list-empty"
          >
            <EaIcon
              name="package"
              :size="40"
            />
            <p>{{ t('memoryRepo.empty') }}</p>
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
                :name="repo.format === 'single' ? 'file-text' : 'package'"
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
        name="package"
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
              name="pencil"
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
              name="trash-2"
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
