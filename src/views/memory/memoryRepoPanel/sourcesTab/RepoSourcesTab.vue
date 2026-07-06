<script setup lang="ts">
/** RepoSourcesTab 组件：记忆库仓库「来源」标签页，配置项目白名单与时间/数量上限（逻辑见 useRepoSourcesTab.ts） */
import { useRepoSourcesTab } from './useRepoSourcesTab'
import { EaButton, EaIcon } from '@/components/common'

const { t, selectedProjectIds, since, until, maxLimit, projectOptions, save, clearAll } =
  useRepoSourcesTab()

function toggleProject(id: string) {
  const index = selectedProjectIds.value.indexOf(id)
  if (index === -1) {
    selectedProjectIds.value = [...selectedProjectIds.value, id]
  } else {
    selectedProjectIds.value = selectedProjectIds.value.filter((p) => p !== id)
  }
}
</script>

<template>
  <div class="repo-sources-tab">
    <section class="repo-sources-tab__section">
      <h3 class="repo-sources-tab__title">
        <EaIcon
          name="lucide:database"
          :size="14"
        />
        内置工具可见范围
      </h3>
      <p class="repo-sources-tab__desc">
        {{ t('memoryRepo.sourcesHint') }}
      </p>

      <div class="repo-sources-tab__field">
        <span class="repo-sources-tab__label">项目白名单</span>
        <div
          v-if="projectOptions.length === 0"
          class="repo-sources-tab__empty"
        >
          暂无项目（不限 = 全部可见）
        </div>
        <div
          v-else
          class="repo-sources-tab__checks"
        >
          <label
            v-for="opt in projectOptions"
            :key="opt.value"
            class="repo-sources-tab__check"
          >
            <input
              type="checkbox"
              :checked="selectedProjectIds.includes(opt.value)"
              @change="toggleProject(opt.value)"
            >
            <span>{{ opt.label }}</span>
          </label>
        </div>
      </div>

      <div class="repo-sources-tab__row">
        <label class="repo-sources-tab__field">
          <span class="repo-sources-tab__label">起始时间（since）</span>
          <input
            v-model="since"
            type="datetime-local"
            class="repo-sources-tab__input"
          >
        </label>
        <label class="repo-sources-tab__field">
          <span class="repo-sources-tab__label">结束时间（until）</span>
          <input
            v-model="until"
            type="datetime-local"
            class="repo-sources-tab__input"
          >
        </label>
        <label class="repo-sources-tab__field">
          <span class="repo-sources-tab__label">返回上限</span>
          <input
            v-model.number="maxLimit"
            type="number"
            min="1"
            max="2000"
            placeholder="200"
            class="repo-sources-tab__input"
          >
        </label>
      </div>

      <div class="repo-sources-tab__actions">
        <EaButton
          variant="primary"
          size="small"
          @click="save"
        >
          <EaIcon
            name="lucide:save"
            :size="14"
          />
          {{ t('common.save') }}
        </EaButton>
        <EaButton
          variant="ghost"
          size="small"
          @click="clearAll"
        >
          {{ t('memoryRepo.clearScope') }}
        </EaButton>
      </div>
    </section>
  </div>
</template>

<style scoped src="./styles.css"></style>
