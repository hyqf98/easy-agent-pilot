<script setup lang="ts">
import {
  useFileChangeReviewWorkspace,
  type FileChangeReviewWorkspaceProps
} from './useFileChangeReviewWorkspace'

const props = withDefaults(defineProps<FileChangeReviewWorkspaceProps>(), {
  sessionId: '',
  requestId: '',
  compact: false
})

const {
  t,
  EaButton,
  EaIcon,
  MonacoDiffEditor,
  selectedIndex,
  traces,
  selectedTrace,
  pendingCount,
  isPending,
  changeTypeBadge,
  lineStats,
  statusText,
  selectTrace,
  navigatePrev,
  navigateNext,
  acceptSelected,
  acceptAll,
  rollbackSelected,
  rollbackAll
} = useFileChangeReviewWorkspace(props)
</script>

<template>
  <section class="file-review">
    <template v-if="traces.length === 0">
      <div class="file-review__empty">
        <EaIcon
          name="file-search"
          :size="22"
        />
        <span>{{ t('fileChange.emptyReview') }}</span>
      </div>
    </template>

    <template v-else>
      <!-- 左侧：变更文件列表 -->
      <aside class="file-review__files">
        <header class="file-review__files-head">
          <span class="file-review__files-title">{{ t('fileChange.changedFiles') }} ({{ traces.length }})</span>
          <span
            v-if="pendingCount > 0"
            class="file-review__files-badge"
          >{{ pendingCount }}</span>
        </header>
        <ul class="file-review__file-list">
          <li
            v-for="(tr, index) in traces"
            :key="tr.id"
            class="file-review__file-item"
            :class="{ 'file-review__file-item--active': index === selectedIndex }"
            @click="selectTrace(index)"
          >
            <EaIcon
              :name="changeTypeBadge(tr.changeType).icon"
              :size="14"
            />
            <span
              class="file-review__file-name"
              :title="tr.filePath"
            >{{ tr.relativePath || tr.filePath }}</span>
            <span
              v-if="lineStats(tr).added > 0"
              class="file-review__file-added"
            >+{{ lineStats(tr).added }}</span>
            <span
              v-if="lineStats(tr).removed > 0"
              class="file-review__file-removed"
            >-{{ lineStats(tr).removed }}</span>
            <span class="file-review__file-status">{{ statusText(tr.status ?? 'pending') }}</span>
          </li>
        </ul>
      </aside>

      <!-- 右侧：差异视图 -->
      <div class="file-review__diff">
        <header
          v-if="selectedTrace"
          class="file-review__diff-head"
        >
          <div class="file-review__diff-info">
            <EaIcon
              :name="changeTypeBadge(selectedTrace.changeType).icon"
              :size="16"
            />
            <span :title="selectedTrace.filePath">{{ selectedTrace.relativePath || selectedTrace.filePath }}</span>
          </div>
          <div class="file-review__diff-actions">
            <EaButton
              size="small"
              :disabled="!isPending(selectedTrace)"
              @click="navigatePrev"
            >
              <EaIcon
                name="chevron-left"
                :size="14"
              />
            </EaButton>
            <EaButton
              size="small"
              :disabled="!isPending(selectedTrace)"
              @click="navigateNext"
            >
              <EaIcon
                name="chevron-right"
                :size="14"
              />
            </EaButton>
            <EaButton
              v-if="isPending(selectedTrace)"
              type="secondary"
              size="small"
              @click="rollbackSelected"
            >
              <EaIcon
                name="undo-2"
                :size="14"
              />
              {{ t('fileChange.rollback') }}
            </EaButton>
            <EaButton
              v-if="isPending(selectedTrace)"
              type="primary"
              size="small"
              @click="acceptSelected"
            >
              <EaIcon
                name="check"
                :size="14"
              />
              {{ t('fileChange.accept') }}
            </EaButton>
          </div>
        </header>
        <div
          v-if="selectedTrace"
          class="file-review__diff-editor"
        >
          <MonacoDiffEditor
            :before-content="selectedTrace.beforeContent ?? ''"
            :after-content="selectedTrace.afterContent ?? ''"
            :file-path="selectedTrace.filePath"
          />
        </div>
      </div>

      <!-- 底部：批量操作 -->
      <footer
        v-if="pendingCount > 0"
        class="file-review__batch"
      >
        <span class="file-review__batch-hint">{{ t('fileChange.batchHint', { count: pendingCount }) }}</span>
        <div class="file-review__batch-actions">
          <EaButton
            type="secondary"
            size="small"
            @click="rollbackAll"
          >
            {{ t('fileChange.rollbackAll') }}
          </EaButton>
          <EaButton
            type="primary"
            size="small"
            @click="acceptAll"
          >
            {{ t('fileChange.acceptAll') }}
          </EaButton>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped src="./FileChangeReviewWorkspace.css"></style>
