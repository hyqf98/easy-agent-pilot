<script setup lang="ts">
import { useRepoOverviewTab } from './useRepoOverviewTab'
import { EaButton, EaIcon } from '@/components/common'

const { t, repo, agentName, formatLabel, updatedText, handleExport } = useRepoOverviewTab()
</script>

<template>
  <div
    v-if="repo"
    class="repo-overview"
  >
    <header class="repo-overview__header">
      <div class="repo-overview__title-row">
        <h2 class="repo-overview__name">
          {{ repo.name }}
        </h2>
        <span
          v-if="!repo.enabled"
          class="repo-overview__badge repo-overview__badge--disabled"
        >已停用</span>
        <EaButton
          variant="ghost"
          size="small"
          class="repo-overview__export"
          @click="handleExport"
        >
          <EaIcon
            name="lucide:download"
            :size="14"
          />
          {{ t('memoryRepo.export') }}
        </EaButton>
      </div>
      <p
        v-if="repo.description"
        class="repo-overview__desc"
      >
        {{ repo.description }}
      </p>
    </header>

    <dl class="repo-overview__grid">
      <div class="repo-overview__item">
        <dt>格式</dt>
        <dd>{{ formatLabel }}</dd>
      </div>
      <div class="repo-overview__item">
        <dt>执行 Agent</dt>
        <dd>{{ agentName || '—' }}</dd>
      </div>
      <div class="repo-overview__item">
        <dt>模型 ID</dt>
        <dd>{{ repo.modelId || '—' }}</dd>
      </div>
      <div class="repo-overview__item">
        <dt>内置工具</dt>
        <dd>{{ repo.internalToolsEnabled ? '已启用' : '未启用' }}</dd>
      </div>
      <div class="repo-overview__item">
        <dt>更新时间</dt>
        <dd>{{ updatedText }}</dd>
      </div>
    </dl>

    <section class="repo-overview__section">
      <h3 class="repo-overview__section-title">
        <EaIcon
          name="lucide:map-pin"
          :size="14"
        />
        仓库路径
      </h3>
      <code class="repo-overview__path">{{ repo.repoPath }}</code>
    </section>

    <section
      v-if="repo.systemPrompt"
      class="repo-overview__section"
    >
      <h3 class="repo-overview__section-title">
        <EaIcon
          name="lucide:message-square"
          :size="14"
        />
        系统提示词
      </h3>
      <pre class="repo-overview__prompt">{{ repo.systemPrompt }}</pre>
    </section>

    <p class="repo-overview__hint">
      {{ t('memoryRepo.phase1Hint') }}
    </p>
  </div>
</template>

<style scoped src="./styles.css"></style>
