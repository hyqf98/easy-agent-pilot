<script setup lang="ts">
import SoloExecutionLogPanel from '../SoloExecutionLogPanel.vue'
import SoloRunCreateDialog from '../soloRunCreateDialog/SoloRunCreateDialog.vue'
import SoloRunList from '../SoloRunList.vue'
import WorkspaceShell from '@/components/layout/WorkspaceShell/WorkspaceShell.vue'
import { EaIcon } from '@/components/common'
import { useSoloModePanel } from './useSoloModePanel'

const {
  canCreate,
  canEditCurrentRun,
  closeCreateDialog,
  closeLogPanel,
  compactSoloSummary,
  completedCount,
  dialogMode,
  coordinatorExpertOptions,
  coordinatorLogCount,
  coordinatorModelLabel,
  coordinatorStatusLabel,
  coordinatorStatusBadge,
  coordinatorSummaryText,
  createForm,
  createRun,
  currentRunDurationLabel,
  currentRunHistorySummary,
  currentRun,
  currentRunCoordinatorLabel,
  currentRunParticipants,
  currentSteps,
  hasCoordinatorLogs,
  isCoordinatorSelected,
  timelineSteps,
  failedCount,
  blockedCount,
  formatTime,
  getStepExpertLabel,
  getStepLogCount,
  handleBrowseExecutionPath,
  handleDelete,
  handlePause,
  handleReset,
  handleReExecute,
  handleResume,
  handleRetry,
  handleStart,
  handleStop,
  isLogPanelOpen,
  isLogPanelResizing,
  logPanelWidth,
  openEditDialog,
  openCreateDialog,
  participantExpertOptions,
  runStatusLabel,
  runs,
  selectRun,
  selectedStep,
  selectedStepId,
  selectStep,
  showCreateDialog,
  soloRunStore,
  stepStatusLabel,
  saveRunEdits,
  updateCreateForm
  ,
  startLogPanelResize
} = useSoloModePanel()
</script>

<template>
  <WorkspaceShell
    :sidebar-width="300"
    :sidebar-min="240"
    :sidebar-max="420"
  >
    <template #sidebar="{ hide }">
      <SoloRunList
        :runs="runs"
        :current-run-id="soloRunStore.currentRunId"
        @select="selectRun"
        @create="openCreateDialog"
        @hide="hide"
      />
    </template>

    <div class="solo-content">
      <div
        class="solo-mode-panel__main"
        :class="{ 'solo-mode-panel__main--with-log': currentRun && isLogPanelOpen }"
      >
        <template v-if="currentRun">
          <div class="solo-run-header">
            <div class="solo-run-header__meta">
              <span class="solo-run-header__tag">执行路径</span>
              <strong>{{ currentRun.executionPath }}</strong>
            </div>

            <div class="solo-run-header__actions">
              <button
                v-if="currentRun.status === 'draft'"
                class="solo-run-header__button solo-run-header__button--primary"
                @click="handleStart"
              >
                启动
              </button>
              <button
                v-if="['failed', 'stopped'].includes(currentRun.status)"
                class="solo-run-header__button solo-run-header__button--primary"
                @click="handleRetry"
              >
                重试
              </button>
              <button
                v-if="currentRun.status === 'failed'"
                class="solo-run-header__button solo-run-header__button--ghost"
                @click="handleStart"
              >
                启动
              </button>
              <button
                v-if="currentRun.status === 'completed'"
                class="solo-run-header__button solo-run-header__button--primary"
                @click="handleReExecute"
              >
                重新执行
              </button>
              <button
                v-if="currentRun.status === 'running'"
                class="solo-run-header__button solo-run-header__button--secondary"
                @click="handlePause"
              >
                暂停
              </button>
              <button
                v-if="['paused', 'blocked'].includes(currentRun.status)"
                class="solo-run-header__button solo-run-header__button--primary"
                :disabled="currentRun.status === 'blocked' && Boolean(currentRun.inputRequest)"
                @click="handleResume"
              >
                继续
              </button>
              <button
                v-if="['running', 'paused', 'blocked'].includes(currentRun.status)"
                class="solo-run-header__button solo-run-header__button--danger"
                @click="handleStop"
              >
                停止
              </button>
              <button
                v-if="canEditCurrentRun"
                class="solo-run-header__button solo-run-header__button--ghost"
                @click="openEditDialog"
              >
                编辑
              </button>
              <button
                class="solo-run-header__button solo-run-header__button--ghost"
                @click="handleReset"
              >
                清空进度
              </button>
              <button
                class="solo-run-header__button solo-run-header__button--ghost"
                @click="handleDelete"
              >
                删除
              </button>
            </div>
          </div>

          <div class="solo-run-strip">
            <div class="solo-run-strip__main">
              <div class="solo-run-strip__title-row">
                <h2>{{ currentRun.name }}</h2>
                <span class="solo-run-strip__status">{{ runStatusLabel(currentRun.status) }}</span>
              </div>
              <p>{{ compactSoloSummary(currentRun.goal || currentRun.requirement, '等待目标') }}</p>
            </div>

            <div class="solo-run-strip__metrics">
              <span>{{ completedCount }} 完成</span>
              <span>{{ blockedCount }} 待输入</span>
              <span>{{ failedCount }} 失败</span>
              <span>深度 {{ currentRun.currentDepth }}/{{ currentRun.maxDispatchDepth }}</span>
              <span>{{ currentSteps.length }} 步骤</span>
              <span>{{ currentRunDurationLabel }}</span>
            </div>
          </div>

          <div class="solo-run-context">
            <section>
              <span>需求</span>
              <p>{{ compactSoloSummary(currentRun.requirement, '无需求说明') }}</p>
            </section>
            <section>
              <span>结论</span>
              <p>{{ compactSoloSummary(currentRunHistorySummary, '等待执行结论') }}</p>
            </section>
            <section>
              <span>专家</span>
              <div class="solo-run-context__chips">
                <span>{{ currentRunCoordinatorLabel }}</span>
                <span
                  v-for="expert in currentRunParticipants"
                  :key="expert.id"
                >
                  {{ expert.name }}
                </span>
                <span
                  v-if="currentRun.coordinatorModelId"
                >
                  {{ currentRun.coordinatorModelId }}
                </span>
              </div>
            </section>
          </div>

          <div class="solo-timeline">
            <div class="solo-timeline__header">
              <div>
                <h3>任务过程时间线</h3>
              </div>
              <div class="solo-timeline__header-side" />
            </div>

            <div
              v-if="currentSteps.length === 0 && !hasCoordinatorLogs"
              class="solo-timeline__empty"
            >
              <p>还没有任何步骤。</p>
              <span>启动后，内置协调 AI 会自动派发第一步并持续轮询执行。</span>
            </div>

            <div
              v-else
              class="solo-timeline__track"
            >
              <article
                class="solo-step-card solo-step-card--coordinator"
                :class="{ 'solo-step-card--active': selectedStepId === '__coordinator__' }"
                @click="selectStep('__coordinator__')"
              >
                <div class="solo-step-card__connector" />
                <div class="solo-step-card__marker solo-step-card__marker--coordinator" />
                <div class="solo-step-card__surface">
                  <div class="solo-step-card__top">
                    <div>
                      <span class="solo-step-card__depth">调度器</span>
                      <h4>{{ currentRunCoordinatorLabel }}</h4>
                    </div>
                    <span
                      class="solo-step-card__status"
                      :class="coordinatorStatusBadge"
                    >
                      {{ coordinatorStatusLabel }}
                    </span>
                  </div>

                  <p class="solo-step-card__summary">
                    {{ coordinatorSummaryText }}
                  </p>

                  <div class="solo-step-card__meta">
                    <span>{{ coordinatorLogCount }} 条日志</span>
                    <span v-if="coordinatorModelLabel">{{ coordinatorModelLabel }}</span>
                  </div>
                </div>
              </article>

              <article
                v-for="step in timelineSteps"
                :key="step.id"
                class="solo-step-card"
                :class="[
                  `solo-step-card--${step.status}`,
                  { 'solo-step-card--active': selectedStepId === step.id }
                ]"
                @click="selectStep(step.id)"
              >
                <div class="solo-step-card__connector" />
                <div class="solo-step-card__marker" />
                <div class="solo-step-card__surface">
                  <div class="solo-step-card__top">
                    <div>
                      <span class="solo-step-card__depth">Depth {{ step.depth }}</span>
                      <h4>{{ step.title }}</h4>
                    </div>
                    <span class="solo-step-card__status">{{ stepStatusLabel(step.status) }}</span>
                  </div>

                  <p class="solo-step-card__summary">
                    {{ compactSoloSummary(step.resultSummary || step.summary || step.description, '等待执行摘要') }}
                  </p>

                  <div class="solo-step-card__meta">
                    <span>{{ getStepExpertLabel(step) }}</span>
                    <span>{{ getStepLogCount(step.id) }} 条日志</span>
                    <span>{{ formatTime(step.updatedAt) }}</span>
                  </div>

                  <div
                    v-if="step.resultFiles.length > 0"
                    class="solo-step-card__files"
                  >
                    <span
                      v-for="file in step.resultFiles.slice(0, 4)"
                      :key="file"
                    >
                      {{ file }}
                    </span>
                  </div>
                </div>
              </article>
            </div>

            <div
              v-if="currentRun.lastError"
              class="solo-timeline__error"
            >
              {{ currentRun.lastError }}
            </div>
          </div>
        </template>

        <div
          v-else
          class="solo-mode-panel__placeholder"
        >
          <EaIcon
            name="route"
            :size="40"
          />
          <p>选择一个运行以查看执行详情</p>
        </div>
      </div>

      <div
        v-if="currentRun && isLogPanelOpen"
        class="solo-mode-panel__log"
        :style="{ width: `${logPanelWidth}px` }"
      >
        <div
          class="solo-mode-panel__log-resizer"
          :class="{ 'solo-mode-panel__log-resizer--active': isLogPanelResizing }"
          @mousedown="startLogPanelResize"
        />
        <button
          class="solo-mode-panel__log-collapse"
          title="收起日志面板"
          @click="closeLogPanel"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <SoloExecutionLogPanel
          :run-id="currentRun.id"
          :step-id="isCoordinatorSelected ? null : selectedStep?.id ?? null"
          :force-coordinator-scope="isCoordinatorSelected"
        />
      </div>
    </div>

    <SoloRunCreateDialog
      :visible="showCreateDialog"
      :mode="dialogMode"
      :form="createForm"
      :coordinator-options="coordinatorExpertOptions"
      :expert-options="participantExpertOptions"
      :can-create="canCreate"
      @browse-execution-path="handleBrowseExecutionPath"
      @close="closeCreateDialog"
      @create-draft="createRun(false)"
      @create-and-start="createRun(true)"
      @save="saveRunEdits"
      @update:form="updateCreateForm"
    />
  </WorkspaceShell>
</template>

<style scoped src="./styles.css"></style>
