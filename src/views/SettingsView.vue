<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import EaButton from '@/components/common/EaButton.vue'
import EaIcon from '@/components/common/EaIcon.vue'

import EaSelect from '@/components/common/EaSelect.vue'
import type { CompressionStrategy } from '@/stores/token'

const router = useRouter()
const settingsStore = useSettingsStore()

// 加载设置
onMounted(async () => {
  await settingsStore.loadSettings()
})

// 选项
const languageOptions = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' }
]

const logLevelOptions = [
  { value: 'debug', label: '调试' },
  { value: 'info', label: '信息' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '错误' }
]

const compressionStrategyOptions = [
  { value: 'simple', label: '简单压缩' },
  { value: 'smart', label: '智能压缩' },
  { value: 'summary', label: 'AI 摘要压缩' }
]

const thresholdOptions = [
  { value: 50, label: '50%' },
  { value: 60, label: '60%' },
  { value: 70, label: '70%' },
  { value: 80, label: '80%' },
  { value: 90, label: '90%' }
]

// 更新设置
function updateSetting<K extends keyof typeof settingsStore.settings>(key: K, value: typeof settingsStore.settings[K]) {
  settingsStore.updateSettings({ [key]: value })
}

// 类型安全的更新函数
function updateLanguage(value: string | number) {
  updateSetting('language', String(value))
}

function updateCompressionStrategy(value: string | number) {
  updateSetting('compressionStrategy', value as CompressionStrategy)
}

function updateCompressionThreshold(value: string | number) {
  updateSetting('compressionThreshold', Number(value))
}

function updateLogLevel(value: string | number) {
  updateSetting('logLevel', value as 'debug' | 'info' | 'warn' | 'error')
}

// 重置设置
async function resetSettings() {
  await settingsStore.resetSettings()
}

// 返回首页
function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="settings-view">
    <!-- 顶部导航栏 -->
    <div class="settings-header">
      <button
        class="back-button"
        @click="goBack"
      >
        <EaIcon
          name="arrow-left"
          :size="18"
        />
        <span>返回首页</span>
      </button>
      <h1 class="settings-title">
        设置
      </h1>
    </div>

    <div class="settings-container">
      <!-- 通用设置 -->
      <section class="settings-section">
        <h3 class="settings-section__title">
          <EaIcon name="settings" :size="18" />
          通用设置
        </h3>
        <div class="settings-group">
          <label class="settings-label">语言</label>
          <EaSelect
            v-model="settingsStore.settings.language"
            :options="languageOptions"
            size="medium"
            @update:model-value="updateLanguage"
          />
        </div>
        <div class="settings-group">
          <label class="settings-label">字体大小</label>
          <div class="settings-slider">
            <input
              type="range"
              :value="settingsStore.settings.fontSize"
              min="12"
              max="24"
              step="1"
              @input="updateSetting('fontSize', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="settings-slider-value">{{ settingsStore.settings.fontSize }}px</span>
          </div>
        </div>
      </section>

      <!-- 行为设置 -->
      <section class="settings-section">
        <h3 class="settings-section__title">
          <EaIcon name="zap" :size="18" />
          行为设置
        </h3>
        <div class="settings-group settings-group--row">
          <label class="settings-label">自动保存</label>
          <label class="settings-switch">
            <input
              type="checkbox"
              :checked="settingsStore.settings.autoSave"
              @change="updateSetting('autoSave', ($event.target as HTMLInputElement).checked)"
            />
            <span class="settings-switch__slider" />
          </label>
        </div>
        <div class="settings-group settings-group--row">
          <label class="settings-label">删除前确认</label>
          <label class="settings-switch">
            <input
              type="checkbox"
              :checked="settingsStore.settings.confirmBeforeDelete"
              @change="updateSetting('confirmBeforeDelete', ($event.target as HTMLInputElement).checked)"
            />
            <span class="settings-switch__slider" />
          </label>
        </div>
        <div class="settings-group settings-group--row">
          <label class="settings-label">Enter 发送消息</label>
          <label class="settings-switch">
            <input
              type="checkbox"
              :checked="settingsStore.settings.sendOnEnter"
              @change="updateSetting('sendOnEnter', ($event.target as HTMLInputElement).checked)"
            />
            <span class="settings-switch__slider" />
          </label>
        </div>
      </section>

      <!-- 会话压缩设置 -->
      <section class="settings-section">
        <h3 class="settings-section__title">
          <EaIcon name="minimize" :size="18" />
          会话压缩
        </h3>
        <p class="settings-section__desc">
          当会话上下文接近模型限制时，自动压缩可以释放 token 空间，让对话继续进行
        </p>
        <div class="settings-group settings-group--row">
          <label class="settings-label">启用自动压缩</label>
          <label class="settings-switch">
            <input
              type="checkbox"
              :checked="settingsStore.settings.autoCompressionEnabled"
              @change="updateSetting('autoCompressionEnabled', ($event.target as HTMLInputElement).checked)"
            />
            <span class="settings-switch__slider" />
          </label>
        </div>
        <div class="settings-group">
          <label class="settings-label">压缩策略</label>
          <EaSelect
            v-model="settingsStore.settings.compressionStrategy"
            :options="compressionStrategyOptions"
            :disabled="!settingsStore.settings.autoCompressionEnabled"
            size="medium"
            @update:model-value="updateCompressionStrategy"
          />
        </div>
        <div class="settings-group">
          <label class="settings-label">压缩阈值</label>
          <EaSelect
            v-model="settingsStore.settings.compressionThreshold"
            :options="thresholdOptions"
            :disabled="!settingsStore.settings.autoCompressionEnabled"
            size="medium"
            @update:model-value="updateCompressionThreshold"
          />
        </div>
      </section>

      <!-- 高级设置 -->
      <section class="settings-section">
        <h3 class="settings-section__title">
          <EaIcon name="terminal" :size="18" />
          高级设置
        </h3>
        <div class="settings-group">
          <label class="settings-label">日志级别</label>
          <EaSelect
            v-model="settingsStore.settings.logLevel"
            :options="logLevelOptions"
            size="medium"
            @update:model-value="updateLogLevel"
          />
        </div>
        <div class="settings-group settings-group--row">
          <label class="settings-label">调试模式</label>
          <label class="settings-switch">
            <input
              type="checkbox"
              :checked="settingsStore.settings.enableDebugMode"
              @change="updateSetting('enableDebugMode', ($event.target as HTMLInputElement).checked)"
            />
            <span class="settings-switch__slider" />
          </label>
        </div>
      </section>

      <!-- 重置按钮 -->
      <div class="settings-actions">
        <EaButton
          type="secondary"
          @click="resetSettings"
        >
          恢复默认设置
        </EaButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  overflow-y: auto;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-6);
  background-color: var(--color-surface-elevated);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.back-button:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.settings-title {
  flex: 1;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.settings-container {
  flex: 1;
  max-width: 800px;
  margin: 0 auto;
  padding: var(--spacing-6);
}

.settings-section {
  background-color: var(--color-surface-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-5);
  margin-bottom: var(--spacing-4);
}

.settings-section__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-4);
  padding-bottom: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
}

.settings-section__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
  padding: var(--spacing-2);
  background-color: var(--color-surface-hover);
  border-radius: var(--radius-md);
}

.settings-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3) 0;
}

.settings-group--row {
  flex-direction: row;
}

.settings-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  min-width: 120px;
}

.settings-slider {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  flex: 1;
}

.settings-slider input[type="range"] {
  flex: 1;
  height: 4px;
  appearance: none;
  background-color: var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.settings-slider input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background-color: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.settings-slider input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.settings-slider-value {
  min-width: 40px;
  text-align: right;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-family-mono);
}

/* Switch 样式 */
.settings-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.settings-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.settings-switch__slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-border);
  transition: var(--transition-fast);
  border-radius: 24px;
}

.settings-switch__slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: var(--transition-fast);
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
}

.settings-switch input:checked + .settings-switch__slider {
  background-color: var(--color-primary);
}

.settings-switch input:checked + .settings-switch__slider:before {
  transform: translateX(20px);
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-4);
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--color-border);
}
</style>
