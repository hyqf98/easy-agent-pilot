<script setup lang="ts">
import { useLogSettings } from './useLogSettings'

const {
  EaButton,
  EaStateBlock,
  SettingsSectionCard,
  t,
  isLoading,
  isClearing,
  isSidebarVisible,
  isListening,
  errorMessage,
  successMessage,
  summary,
  files,
  lineLimitOptions,
  selectedLineLimit,
  selectedFileName,
  selectedFile,
  logContent,
  displayedLogContent,
  contentRef,
  formatBytes,
  formatDate,
  handleManualRefresh,
  handleStartListening,
  handlePauseListening,
  handleClearLogs
} = useLogSettings()
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
