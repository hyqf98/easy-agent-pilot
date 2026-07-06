<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import type { UnwatchFn } from '@tauri-apps/plugin-fs'
import { EaButton, EaStateBlock } from '@/components/common'
import SettingsSectionCard from '@/views/settings/common/SettingsSectionCard.vue'
import { startFsWatcher } from '@/utils/fsWatcher'

interface RuntimeLogFileInfo {
  name: string
  path: string
  sizeBytes: number
  modifiedAt?: string | null
}

interface RuntimeLogSummary {
  logDir: string
  fileCount: number
  totalSizeBytes: number
  latestFile?: RuntimeLogFileInfo | null
}

interface RuntimeLogReadResult {
  file: RuntimeLogFileInfo
  content: string
  truncated: boolean
  lineCount: number
}

const { t } = useI18n()

const isLoading = ref(false)
const isClearing = ref(false)
const isSidebarVisible = ref(false)
const isListening = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const summary = ref<RuntimeLogSummary | null>(null)
const files = ref<RuntimeLogFileInfo[]>([])
const lineLimitOptions = [200, 500, 1000, 2000, 5000] as const
const selectedLineLimit = ref<number>(500)
const selectedFileName = ref('')
const logContent = ref<RuntimeLogReadResult | null>(null)
const contentRef = ref<HTMLElement | null>(null)
let logWatcherCleanup: UnwatchFn | null = null
let watchGeneration = 0
let refreshTimer: number | null = null
let pollingTimer: number | null = null
let syncingSelectedFile = false

const selectedFile = computed(() =>
  files.value.find((item) => item.name === selectedFileName.value) || null
)

const displayedLogContent = computed(() => {
  const content = logContent.value?.content ?? ''
  if (!content) {
    return ''
  }

  const endsWithNewline = content.endsWith('\n')
  const reversed = content.split('\n').reverse().join('\n')
  return endsWithNewline ? `${reversed}\n` : reversed
})

function formatBytes(value: number): string {
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function scrollContentToLatest() {
  await nextTick()
  if (!contentRef.value) {
    return
  }
  contentRef.value.scrollTop = 0
}

function stopWatchingLogs() {
  if (logWatcherCleanup) {
    logWatcherCleanup()
    logWatcherCleanup = null
  }

  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }

  if (pollingTimer !== null) {
    window.clearInterval(pollingTimer)
    pollingTimer = null
  }
}

async function loadLogFile(fileName?: string, options: { scrollToLatest?: boolean } = {}) {
  if (!fileName) {
    logContent.value = null
    return
  }

  try {
    logContent.value = await invoke<RuntimeLogReadResult>('read_runtime_log_file_command', {
      fileName,
      tailLines: selectedLineLimit.value
    })

    if (options.scrollToLatest !== false) {
      await scrollContentToLatest()
    }
  } catch (error) {
    logContent.value = null
    errorMessage.value = `${t('settings.logs.readFailed')}: ${error}`
  }
}

async function loadLogs(options: { preferLatest?: boolean; scrollToLatest?: boolean } = {}) {
  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const [nextSummary, nextFiles] = await Promise.all([
      invoke<RuntimeLogSummary>('get_runtime_log_summary_command'),
      invoke<RuntimeLogFileInfo[]>('list_runtime_log_files_command')
    ])

    summary.value = nextSummary
    files.value = nextFiles

    if (!nextFiles.length) {
      selectedFileName.value = ''
      logContent.value = null
      return
    }

    const shouldPreferLatest = options.preferLatest ?? false
    const preferredName = shouldPreferLatest || !nextFiles.some((item) => item.name === selectedFileName.value)
      ? (nextSummary.latestFile?.name ?? nextFiles[0].name)
      : selectedFileName.value

    syncingSelectedFile = true
    try {
      selectedFileName.value = preferredName
      await loadLogFile(preferredName, { scrollToLatest: options.scrollToLatest })
    } finally {
      syncingSelectedFile = false
    }
  } catch (error) {
    errorMessage.value = `${t('settings.logs.loadFailed')}: ${error}`
  } finally {
    isLoading.value = false
  }
}

async function refreshLogsSilently() {
  try {
    const [nextSummary, nextFiles] = await Promise.all([
      invoke<RuntimeLogSummary>('get_runtime_log_summary_command'),
      invoke<RuntimeLogFileInfo[]>('list_runtime_log_files_command')
    ])

    summary.value = nextSummary
    files.value = nextFiles

    if (!nextFiles.length) {
      selectedFileName.value = ''
      logContent.value = null
      return
    }

    const preferredName = nextFiles.some((item) => item.name === selectedFileName.value)
      ? selectedFileName.value
      : (nextSummary.latestFile?.name ?? nextFiles[0].name)

    syncingSelectedFile = true
    try {
      selectedFileName.value = preferredName
      await loadLogFile(preferredName, { scrollToLatest: true })
    } finally {
      syncingSelectedFile = false
    }
  } catch (error) {
    console.error('[LogSettings] auto refresh failed:', error)
  }
}

async function bindLogWatcher(logDir?: string) {
  watchGeneration += 1
  const generation = watchGeneration

  stopWatchingLogs()

  if (!isListening.value || !logDir) {
    return
  }

  const unwatch = await startFsWatcher(logDir, () => {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
    }
    refreshTimer = window.setTimeout(() => {
      void refreshLogsSilently()
    }, 150)
  }, {
    recursive: false,
    delayMs: 120
  })

  if (generation === watchGeneration) {
    logWatcherCleanup = unwatch
    pollingTimer = window.setInterval(() => {
      void refreshLogsSilently()
    }, 1200)
  } else if (unwatch) {
    unwatch()
  }
}

async function handleManualRefresh() {
  await loadLogs({ scrollToLatest: true })
}

async function handleStartListening() {
  if (isListening.value) {
    return
  }

  await loadLogs({ scrollToLatest: true })
  isListening.value = true
}

function handlePauseListening() {
  isListening.value = false
}

async function handleClearLogs() {
  if (isClearing.value) {
    return
  }

  if (!window.confirm(t('settings.logs.clearConfirm'))) {
    return
  }

  isClearing.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const removed = await invoke<number>('clear_runtime_log_files_command')
    successMessage.value = t('settings.logs.clearSuccess', { count: removed })
    await loadLogs({ preferLatest: true, scrollToLatest: true })
  } catch (error) {
    errorMessage.value = `${t('settings.logs.clearFailed')}: ${error}`
  } finally {
    isClearing.value = false
  }
}

watch(selectedFileName, async (fileName, previous) => {
  if (!fileName || fileName === previous || syncingSelectedFile) {
    return
  }
  errorMessage.value = ''
  await loadLogFile(fileName, { scrollToLatest: true })
})

watch(selectedLineLimit, async () => {
  if (!selectedFileName.value) {
    return
  }

  errorMessage.value = ''
  await loadLogFile(selectedFileName.value, { scrollToLatest: true })
})

watch(isListening, (listening) => {
  if (!listening) {
    stopWatchingLogs()
    return
  }

  void bindLogWatcher(summary.value?.logDir)
})

watch(
  () => summary.value?.logDir,
  (logDir) => {
    void bindLogWatcher(logDir)
  },
  { immediate: true }
)

onMounted(() => {
  void loadLogs({ preferLatest: true, scrollToLatest: true })
})

onBeforeUnmount(() => {
  stopWatchingLogs()
})
</script>

<template>
  <div class="log-settings">
    <SettingsSectionCard
      :title="t('settings.logs.title')"
      :description="t('settings.logs.description')"
    >
      <template #actions>
        <label class="log-settings__limit-control">
          <span class="log-settings__limit-label">
            {{ t('settings.logs.latestLines') }}
          </span>
          <select
            v-model.number="selectedLineLimit"
            class="log-settings__limit-select"
          >
            <option
              v-for="option in lineLimitOptions"
              :key="option"
              :value="option"
            >
              {{ t('settings.logs.latestLinesOption', { count: option }) }}
            </option>
          </select>
        </label>
        <EaButton
          type="secondary"
          @click="handleManualRefresh"
        >
          {{ t('settings.logs.refresh') }}
        </EaButton>
        <EaButton
          type="secondary"
          :disabled="isListening"
          @click="handleStartListening"
        >
          {{ t('settings.logs.startListening') }}
        </EaButton>
        <EaButton
          type="secondary"
          :disabled="!isListening"
          @click="handlePauseListening"
        >
          {{ t('settings.logs.pauseListening') }}
        </EaButton>
        <EaButton
          type="secondary"
          :disabled="!files.length"
          @click="isSidebarVisible = !isSidebarVisible"
        >
          {{ isSidebarVisible ? t('settings.logs.hideFiles') : t('settings.logs.showFiles') }}
        </EaButton>
        <EaButton
          type="danger"
          :loading="isClearing"
          :disabled="!files.length"
          @click="handleClearLogs"
        >
          {{ t('settings.logs.clear') }}
        </EaButton>
      </template>

      <EaStateBlock
        v-if="isLoading && !summary"
        variant="loading"
        :title="t('settings.logs.loadingTitle')"
        :description="t('settings.logs.loadingDescription')"
      />
      <EaStateBlock
        v-else-if="errorMessage"
        variant="error"
        :title="t('settings.logs.errorTitle')"
        :description="errorMessage"
      />
      <EaStateBlock
        v-else-if="!files.length"
        variant="empty"
        icon="scroll-text"
        :title="t('settings.logs.emptyTitle')"
        :description="t('settings.logs.emptyDescription')"
      />

      <div
        v-if="files.length"
        :class="['log-settings__workspace', { 'log-settings__workspace--full': !isSidebarVisible }]"
      >
        <div
          v-if="isSidebarVisible"
          class="log-settings__sidebar"
        >
          <button
            v-for="item in files"
            :key="item.name"
            :class="['log-settings__file', { 'log-settings__file--active': item.name === selectedFileName }]"
            @click="selectedFileName = item.name"
          >
            <div class="log-settings__file-name">
              {{ item.name }}
            </div>
            <div class="log-settings__file-meta">
              <span>{{ formatDate(item.modifiedAt) }}</span>
              <span>{{ formatBytes(item.sizeBytes) }}</span>
            </div>
          </button>
        </div>

        <div class="log-settings__viewer">
          <div
            v-if="selectedFile"
            class="log-settings__viewer-header"
          >
            <div>
              <div class="log-settings__viewer-title">
                {{ selectedFile.name }}
              </div>
              <div class="log-settings__viewer-subtitle">
                {{ formatDate(selectedFile.modifiedAt) }}
              </div>
            </div>
            <div class="log-settings__viewer-badges">
              <span class="badge">{{ formatBytes(selectedFile.sizeBytes) }}</span>
              <span
                v-if="logContent"
                class="badge"
              >
                {{ t('settings.logs.visibleLineCount', { count: logContent.lineCount }) }}
              </span>
              <span class="badge badge--neutral">
                {{ t('settings.logs.latestLinesShort', { count: selectedLineLimit }) }}
              </span>
            </div>
          </div>

          <div
            v-if="logContent?.truncated"
            class="log-settings__truncated"
          >
            {{ t('settings.logs.truncatedNotice') }}
          </div>

          <pre
            ref="contentRef"
            class="log-settings__content"
          >{{ displayedLogContent }}</pre>
        </div>
      </div>

      <p
        v-if="successMessage"
        class="log-settings__success"
      >
        {{ successMessage }}
      </p>
    </SettingsSectionCard>
  </div>
</template>
<style scoped src="./LogSettings.css"></style>
