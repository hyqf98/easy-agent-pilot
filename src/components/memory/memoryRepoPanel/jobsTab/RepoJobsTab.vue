<script setup lang="ts">
import { useRepoJobsTab, CRON_PRESETS } from './useRepoJobsTab'
import { EaButton, EaIcon, EaInput, EaModal, EaSelect } from '@/components/common'

const {
  t,
  jobs,
  runs,
  isLoadingJobs,
  runningJobId,
  isModalVisible,
  editingJob,
  draft,
  agentOptions,
  openCreateModal,
  openEditModal,
  closeModal,
  handleSubmit,
  handleDelete,
  handleRunNow
} = useRepoJobsTab()

function formatTime(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}
</script>

<template>
  <div class="repo-jobs-tab">
    <div class="repo-jobs-tab__header">
      <h3 class="repo-jobs-tab__title">
        <EaIcon
          name="lucide:clock"
          :size="14"
        />
        定时任务
      </h3>
      <EaButton
        variant="primary"
        size="small"
        @click="openCreateModal"
      >
        <EaIcon
          name="lucide:plus"
          :size="14"
        />
        新建任务
      </EaButton>
    </div>
    <p class="repo-jobs-tab__desc">
      {{ t('memoryRepo.jobsHint') }}
    </p>

    <div
      v-if="isLoadingJobs && jobs.length === 0"
      class="repo-jobs-tab__empty"
    >
      {{ t('common.loading') }}
    </div>
    <div
      v-else-if="jobs.length === 0"
      class="repo-jobs-tab__empty"
    >
      暂无定时任务
    </div>

    <div
      v-else
      class="repo-jobs-tab__list"
    >
      <div
        v-for="job in jobs"
        :key="job.id"
        class="repo-jobs-tab__item"
      >
        <div class="repo-jobs-tab__item-main">
          <div class="repo-jobs-tab__item-header">
            <span class="repo-jobs-tab__item-name">{{ job.name }}</span>
            <span
              class="repo-jobs-tab__item-status"
              :data-status="job.scheduleStatus"
            >{{ job.scheduleStatus }}</span>
            <span
              v-if="runningJobId === job.id"
              class="repo-jobs-tab__item-running"
            >
              <EaIcon
                name="lucide:loader-2"
                :size="12"
                class="repo-jobs-tab__spinner"
              />
              运行中
            </span>
          </div>
          <p class="repo-jobs-tab__item-instruction">
            {{ job.instruction }}
          </p>
          <div class="repo-jobs-tab__item-meta">
            <span>cron: {{ job.cron || '一次性' }}</span>
            <span>下次: {{ formatTime(job.nextRunAt) }}</span>
            <span>上次: {{ formatTime(job.lastRunAt) }}（{{ job.lastRunStatus || '—' }}）</span>
          </div>
        </div>
        <div class="repo-jobs-tab__item-actions">
          <EaButton
            variant="ghost"
            size="small"
            :disabled="runningJobId === job.id"
            @click="handleRunNow(job)"
          >
            <EaIcon
              name="lucide:play"
              :size="13"
            />
            立即运行
          </EaButton>
          <EaButton
            variant="ghost"
            size="small"
            @click="openEditModal(job)"
          >
            <EaIcon
              name="lucide:pencil"
              :size="13"
            />
          </EaButton>
          <EaButton
            variant="ghost"
            size="small"
            danger
            @click="handleDelete(job)"
          >
            <EaIcon
              name="lucide:trash-2"
              :size="13"
            />
          </EaButton>
        </div>
      </div>
    </div>

    <!-- 运行历史（编辑弹窗内） -->
    <EaModal
      :visible="isModalVisible"
      content-class="repo-jobs-dialog"
      @update:visible="isModalVisible = $event"
    >
      <template #header>
        <h3 class="repo-jobs-dialog__title">
          {{ editingJob ? '编辑定时任务' : '新建定时任务' }}
        </h3>
      </template>
      <div class="repo-jobs-dialog__body">
        <label class="repo-jobs-dialog__field">
          <span>名称</span>
          <EaInput
            v-model="draft.name"
            placeholder="例如：每日历史归纳"
          />
        </label>
        <label class="repo-jobs-dialog__field">
          <span>指令</span>
          <textarea
            v-model="draft.instruction"
            class="repo-jobs-dialog__textarea"
            rows="4"
            placeholder="告诉 AI 执行什么。例如：归纳今日对话历史，更新本仓库文件。"
          />
        </label>
        <label class="repo-jobs-dialog__field">
          <span>调度</span>
          <EaSelect
            v-model="draft.cron"
            :options="CRON_PRESETS"
          />
        </label>
        <div class="repo-jobs-dialog__row">
          <label class="repo-jobs-dialog__field">
            <span>执行 Agent（覆盖仓库）</span>
            <EaSelect
              v-model="draft.agentId"
              :options="agentOptions"
              placeholder="沿用仓库绑定"
            />
          </label>
        </div>

        <div
          v-if="editingJob && runs.length > 0"
          class="repo-jobs-dialog__runs"
        >
          <h4 class="repo-jobs-dialog__runs-title">
            运行历史
          </h4>
          <div
            v-for="run in runs.slice(0, 8)"
            :key="run.id"
            class="repo-jobs-dialog__run"
          >
            <span :data-status="run.status">{{ run.status }}</span>
            <span>{{ formatTime(run.startedAt) }}</span>
            <span class="repo-jobs-dialog__run-summary">{{ run.summary || '—' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <EaButton
          type="secondary"
          @click="closeModal"
        >
          取消
        </EaButton>
        <EaButton
          :disabled="!(draft.name ?? '').trim() || !(draft.instruction ?? '').trim()"
          @click="handleSubmit"
        >
          {{ editingJob ? '保存' : '创建' }}
        </EaButton>
      </template>
    </EaModal>
  </div>
</template>

<style scoped src="./styles.css"></style>
