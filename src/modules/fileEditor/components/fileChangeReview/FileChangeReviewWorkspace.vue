<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import MonacoDiffEditor from '../monacoDiffEditor/MonacoDiffEditor.vue'
import { useFileChangeStore } from '@/stores/fileChange'
import type { FileEditTrace } from '@/types/fileTrace'

const props = withDefaults(defineProps<{
  sessionId?: string
  requestId?: string
  compact?: boolean
}>(), {
  sessionId: '',
  requestId: '',
  compact: false
})

const { t } = useI18n()
const fileChangeStore = useFileChangeStore()
const selectedIndex = ref(0)

const traces = computed<FileEditTrace[]>(() =>
  fileChangeStore.getTracesForRequest(props.sessionId, props.requestId)
)
const selectedTrace = computed<FileEditTrace | null>(() => traces.value[selectedIndex.value] ?? null)
const pendingCount = computed(() => traces.value.filter(tr => (tr.status ?? 'pending') === 'pending').length)

function isPending(trace: FileEditTrace) {
  return (trace.status ?? 'pending') === 'pending'
}

function changeTypeBadge(changeType: string) {
  switch (changeType) {
    case 'create': return { cls: 'create', icon: 'file-plus' }
    case 'delete': return { cls: 'delete', icon: 'file-minus' }
    default: return { cls: 'modify', icon: 'file-pen' }
  }
}

function lineStats(trace: FileEditTrace) {
  const before = (trace.beforeContent ?? '').split('\n').filter(l => l !== '').length
  const after = (trace.afterContent ?? '').split('\n').filter(l => l !== '').length
  if (trace.changeType === 'create') return { added: after, removed: 0 }
  if (trace.changeType === 'delete') return { added: 0, removed: before }
  const delta = after - before
  return delta >= 0 ? { added: delta, removed: 0 } : { added: 0, removed: -delta }
}

function statusText(status: string) {
  const map: Record<string, string> = {
    pending: t('fileChange.statusPending'),
    accepted: t('fileChange.statusAccepted'),
    rolled_back: t('fileChange.statusRolledBack')
  }
  return map[status] ?? status
}

function selectTrace(index: number) {
  selectedIndex.value = index
}

function navigatePrev() {
  if (selectedIndex.value > 0) selectedIndex.value--
}

function navigateNext() {
  if (selectedIndex.value < traces.value.length - 1) selectedIndex.value++
}

async function acceptSelected() {
  const trace = selectedTrace.value
  if (trace) await fileChangeStore.accept(trace.id)
}

async function acceptAll() {
  await fileChangeStore.acceptAll()
}

async function rollbackSelected() {
  const trace = selectedTrace.value
  if (trace) await fileChangeStore.rollback(trace.id)
}

async function rollbackAll() {
  await fileChangeStore.rollbackAll()
}
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
