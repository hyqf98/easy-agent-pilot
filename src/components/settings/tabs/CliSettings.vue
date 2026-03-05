<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore, type CliPathEntry } from '@/stores/settings'
import { EaButton, EaIcon } from '@/components/common'
import { open } from '@tauri-apps/plugin-dialog'

const { t } = useI18n()
const settingsStore = useSettingsStore()

// CLI 名称选项
const cliNameOptions = [
  { value: 'claude', label: 'Claude CLI' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'aider', label: 'Aider' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'other', label: '其他' }
]

// 模态框状态
const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const editingEntry = ref<CliPathEntry | null>(null)

// 表单状态
const formData = reactive({
  name: '',
  path: ''
})
const formError = ref('')
const isValidating = ref(false)
const validationResult = ref<{ valid: boolean; version: string | null } | null>(null)

// 删除确认状态
const showDeleteConfirm = ref(false)
const deletingEntry = ref<CliPathEntry | null>(null)

// 计算属性
const hasCliTools = computed(() => settingsStore.cliTools.length > 0)
const hasCustomPaths = computed(() => settingsStore.customCliPaths.length > 0)

// 状态图标和颜色
const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'available':
      return 'check-circle'
    case 'not_found':
      return 'x-circle'
    case 'error':
      return 'alert-triangle'
    default:
      return 'help-circle'
  }
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'available':
      return 'var(--color-success)'
    case 'not_found':
      return 'var(--color-text-tertiary)'
    case 'error':
      return 'var(--color-warning)'
    default:
      return 'var(--color-text-tertiary)'
  }
}

const getStatusText = (status: string): string => {
  switch (status) {
    case 'available':
      return t('settings.cli.statusAvailable')
    case 'not_found':
      return t('settings.cli.statusNotFound')
    case 'error':
      return t('settings.cli.statusError')
    default:
      return t('settings.cli.statusNotFound')
  }
}

// 处理检测
const handleDetect = async () => {
  try {
    await settingsStore.detectCliTools()
  } catch (error) {
    console.error('Detection failed:', error)
  }
}

// 打开添加模态框
const openAddModal = () => {
  modalMode.value = 'add'
  editingEntry.value = null
  formData.name = ''
  formData.path = ''
  formError.value = ''
  validationResult.value = null
  showModal.value = true
}

// 打开编辑模态框
const openEditModal = (entry: CliPathEntry) => {
  modalMode.value = 'edit'
  editingEntry.value = entry
  formData.name = entry.name
  formData.path = entry.path
  formError.value = ''
  validationResult.value = entry.version
    ? { valid: true, version: entry.version }
    : null
  showModal.value = true
}

// 关闭模态框
const closeModal = () => {
  showModal.value = false
  editingEntry.value = null
}

// 浏览文件
const handleBrowse = async () => {
  const selected = await open({
    title: '选择 CLI 可执行文件',
    multiple: false,
    directory: false,
    filters: [
      { name: '可执行文件', extensions: ['*'] }
    ]
  })

  if (selected && typeof selected === 'string') {
    formData.path = selected
    // 自动验证
    await validatePath()
  }
}

// 验证路径
const validatePath = async () => {
  if (!formData.path) {
    validationResult.value = null
    return
  }

  isValidating.value = true
  formError.value = ''

  try {
    const tool = await settingsStore.verifyCliPath(formData.path)
    validationResult.value = {
      valid: tool.status === 'available',
      version: tool.version
    }
    if (tool.status !== 'available' && formData.name === '') {
      formData.name = tool.name
    }
  } catch {
    formError.value = '验证失败'
    validationResult.value = { valid: false, version: null }
  } finally {
    isValidating.value = false
  }
}

// 提交表单
const handleSubmit = async () => {
  if (!formData.name || !formData.path) {
    formError.value = t('settings.cli.nameAndPathRequired')
    return
  }

  formError.value = ''

  try {
    if (modalMode.value === 'add') {
      await settingsStore.addCustomCliPath(formData.name, formData.path)
    } else if (editingEntry.value) {
      await settingsStore.updateCustomCliPath(
        editingEntry.value.id,
        formData.name,
        formData.path
      )
    }
    closeModal()
  } catch (error) {
    formError.value = t('settings.cli.saveFailed')
    console.error('Save failed:', error)
  }
}

// 请求删除
const requestDelete = (entry: CliPathEntry) => {
  deletingEntry.value = entry
  showDeleteConfirm.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!deletingEntry.value) return

  try {
    await settingsStore.deleteCustomCliPath(deletingEntry.value.id)
    showDeleteConfirm.value = false
    deletingEntry.value = null
  } catch (error) {
    console.error('Delete failed:', error)
  }
}

// 取消删除
const cancelDelete = () => {
  showDeleteConfirm.value = false
  deletingEntry.value = null
}

// 组件挂载时加载数据
onMounted(() => {
  if (settingsStore.cliTools.length === 0) {
    handleDetect()
  }
  settingsStore.loadCustomCliPaths()
})
</script>

<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <h3 class="settings-page__title">
        {{ t('settings.cli.title') }}
      </h3>
      <div class="settings-page__actions">
        <EaButton
          type="secondary"
          size="small"
          :loading="settingsStore.isDetectingCli"
          @click="handleDetect"
        >
          <EaIcon
            v-if="!settingsStore.isDetectingCli"
            name="search"
            :size="16"
          />
          {{ t('settings.cli.autoDetect') }}
        </EaButton>
      </div>
    </div>

    <!-- 检测进度提示 -->
    <div
      v-if="settingsStore.isDetectingCli"
      class="detection-progress"
    >
      <div class="detection-progress__spinner">
        <svg
          viewBox="0 0 24 24"
          class="animate-spin"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="3"
            fill="none"
            stroke-dasharray="31.416"
            stroke-dashoffset="10"
          />
        </svg>
      </div>
      <span class="detection-progress__text">{{ t('settings.cli.scanning') }}</span>
    </div>

    <!-- 检测结果提示 -->
    <div
      v-else-if="settingsStore.detectionComplete && hasCliTools"
      class="detection-result detection-result--success"
    >
      <EaIcon
        name="check-circle"
        :size="16"
      />
      <span>{{ t('settings.cli.foundTools', { n: settingsStore.foundCliCount }) }}</span>
    </div>

    <div
      v-else-if="settingsStore.detectionComplete && !hasCliTools"
      class="detection-result detection-result--empty"
    >
      <EaIcon
        name="info"
        :size="16"
      />
      <span>{{ t('settings.cli.noToolsFound') }}</span>
    </div>

    <!-- 自动检测的 CLI 工具列表 -->
    <div
      v-if="hasCliTools"
      class="cli-section"
    >
      <h4 class="cli-section__title">
        {{ t('settings.cli.autoDetected') }}
      </h4>
      <div class="cli-list">
        <div
          v-for="tool in settingsStore.cliTools"
          :key="tool.name"
          class="cli-card"
        >
          <div class="cli-card__header">
            <div class="cli-card__name">
              <EaIcon
                name="terminal"
                :size="18"
              />
              <span>{{ tool.name }}</span>
            </div>
            <div
              class="cli-card__status"
              :style="{ color: getStatusColor(tool.status) }"
            >
              <EaIcon
                :name="getStatusIcon(tool.status)"
                :size="16"
              />
              <span>{{ getStatusText(tool.status) }}</span>
            </div>
          </div>

          <div class="cli-card__body">
            <div class="cli-card__row">
              <span class="cli-card__label">{{ t('settings.cli.path') }}</span>
              <span class="cli-card__value cli-card__path">
                {{ tool.path || '-' }}
              </span>
            </div>
            <div class="cli-card__row">
              <span class="cli-card__label">{{ t('settings.cli.version') }}</span>
              <span class="cli-card__value">
                {{ tool.version || '-' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 手动配置的 CLI 路径 -->
    <div class="cli-section">
      <div class="cli-section__header">
        <h4 class="cli-section__title">
          {{ t('settings.cli.manualConfig') }}
        </h4>
        <EaButton
          type="primary"
          size="small"
          @click="openAddModal"
        >
          <EaIcon
            name="plus"
            :size="16"
          />
          {{ t('settings.cli.addCli') }}
        </EaButton>
      </div>

      <!-- 自定义 CLI 列表 -->
      <div
        v-if="hasCustomPaths"
        class="cli-list"
      >
        <div
          v-for="entry in settingsStore.customCliPaths"
          :key="entry.id"
          class="cli-card cli-card--custom"
        >
          <div class="cli-card__header">
            <div class="cli-card__name">
              <EaIcon
                name="terminal"
                :size="18"
              />
              <span>{{ entry.name }}</span>
            </div>
            <div class="cli-card__actions">
              <button
                class="cli-card__action-btn"
                title="编辑"
                @click="openEditModal(entry)"
              >
                <EaIcon
                  name="edit"
                  :size="16"
                />
              </button>
              <button
                class="cli-card__action-btn cli-card__action-btn--danger"
                title="删除"
                @click="requestDelete(entry)"
              >
                <EaIcon
                  name="trash"
                  :size="16"
                />
              </button>
            </div>
          </div>

          <div class="cli-card__body">
            <div class="cli-card__row">
              <span class="cli-card__label">{{ t('settings.cli.path') }}</span>
              <span class="cli-card__value cli-card__path">
                {{ entry.path }}
              </span>
            </div>
            <div class="cli-card__row">
              <span class="cli-card__label">{{ t('settings.cli.version') }}</span>
              <span class="cli-card__value">
                <template v-if="entry.version">
                  <EaIcon
                    name="check-circle"
                    :size="14"
                    style="color: var(--color-success); margin-right: 4px;"
                  />
                  {{ entry.version }}
                </template>
                <template v-else>
                  <EaIcon
                    name="x-circle"
                    :size="14"
                    style="color: var(--color-error, #ef4444); margin-right: 4px;"
                  />
                  <span style="color: var(--color-error, #ef4444);">{{ t('settings.cli.verificationFailed') }}</span>
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-else
        class="settings-empty settings-empty--compact"
      >
        <EaIcon
          name="folder-plus"
          :size="32"
          class="settings-empty__icon"
        />
        <p class="settings-empty__text">
          {{ t('settings.cli.noCustomPaths') }}
        </p>
        <p class="settings-empty__hint">
          {{ t('settings.cli.noCustomPathsHint') }}
        </p>
      </div>
    </div>

    <!-- 帮助说明 -->
    <div class="settings-card">
      <h4 class="settings-card__title">
        {{ t('settings.cli.scanPathsHelp') }}
      </h4>
      <div class="help-section">
        <div class="help-section__item">
          <span class="help-section__label">macOS:</span>
          <span class="help-section__value">/usr/local/bin, /opt/homebrew/bin, ~/.local/bin, ~/Applications, /Applications</span>
        </div>
        <div class="help-section__item">
          <span class="help-section__label">Linux:</span>
          <span class="help-section__value">/usr/local/bin, /usr/bin, ~/.local/bin, ~/.npm-global/bin, /snap/bin</span>
        </div>
        <div class="help-section__item">
          <span class="help-section__label">Windows:</span>
          <span class="help-section__value">%LOCALAPPDATA%\npm, %APPDATA%\npm, %USERPROFILE%\.local\bin, %LOCALAPPDATA%\Programs</span>
        </div>
      </div>
    </div>

    <!-- 添加/编辑模态框 -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="modal-overlay"
        @click.self="closeModal"
      >
        <div class="modal">
          <div class="modal__header">
            <h3 class="modal__title">
              {{ modalMode === 'add' ? t('settings.cli.addCliTitle') : t('settings.cli.editCliTitle') }}
            </h3>
            <button
              class="modal__close"
              @click="closeModal"
            >
              <EaIcon
                name="x"
                :size="20"
              />
            </button>
          </div>

          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">{{ t('settings.cli.cliName') }}</label>
              <select
                v-model="formData.name"
                class="form-select"
              >
                <option
                  value=""
                  disabled
                >
                  {{ t('settings.cli.selectCli') }}
                </option>
                <option
                  v-for="opt in cliNameOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">{{ t('settings.cli.executablePath') }}</label>
              <div class="form-input-group">
                <input
                  v-model="formData.path"
                  type="text"
                  class="form-input"
                  :placeholder="t('settings.cli.pathPlaceholder')"
                  @blur="validatePath"
                >
                <EaButton
                  type="secondary"
                  size="small"
                  @click="handleBrowse"
                >
                  {{ t('settings.cli.browse') }}
                </EaButton>
              </div>
            </div>

            <!-- 验证结果 -->
            <div
              v-if="isValidating"
              class="validation-status validation-status--loading"
            >
              <div class="validation-spinner">
                <svg
                  viewBox="0 0 24 24"
                  class="animate-spin"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="3"
                    fill="none"
                    stroke-dasharray="31.416"
                    stroke-dashoffset="10"
                  />
                </svg>
              </div>
              <span>{{ t('settings.cli.validating') }}</span>
            </div>
            <div
              v-else-if="validationResult"
              class="validation-status"
              :class="validationResult.valid ? 'validation-status--success' : 'validation-status--error'"
            >
              <EaIcon
                :name="validationResult.valid ? 'check-circle' : 'x-circle'"
                :size="16"
              />
              <span v-if="validationResult.valid">{{ t('settings.cli.validationSuccess', { version: validationResult.version }) }}</span>
              <span v-else>{{ t('settings.cli.validationFailed') }}</span>
            </div>

            <!-- 错误信息 -->
            <div
              v-if="formError"
              class="form-error"
            >
              {{ formError }}
            </div>
          </div>

          <div class="modal__footer">
            <EaButton
              type="secondary"
              @click="closeModal"
            >
              {{ t('common.cancel') }}
            </EaButton>
            <EaButton
              type="primary"
              :disabled="!formData.name || !formData.path"
              @click="handleSubmit"
            >
              {{ modalMode === 'add' ? t('common.create') : t('common.save') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认对话框 -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="modal-overlay"
        @click.self="cancelDelete"
      >
        <div class="modal modal--small">
          <div class="modal__header">
            <h3 class="modal__title">
              {{ t('settings.cli.confirmDelete') }}
            </h3>
          </div>

          <div class="modal__body">
            <p>{{ t('settings.cli.confirmDeleteMessage', { name: deletingEntry?.name }) }}</p>
          </div>

          <div class="modal__footer">
            <EaButton
              type="secondary"
              @click="cancelDelete"
            >
              {{ t('common.cancel') }}
            </EaButton>
            <EaButton
              type="primary"
              @click="confirmDelete"
            >
              {{ t('common.delete') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.settings-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-page__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.settings-page__actions {
  display: flex;
  gap: var(--spacing-2);
}

/* 检测进度 */
.detection-progress {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  background-color: var(--color-primary-light);
  border-radius: var(--radius-lg);
}

.detection-progress__spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-primary);
}

.detection-progress__spinner svg {
  width: 100%;
  height: 100%;
}

.detection-progress__text {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
}

/* 检测结果提示 */
.detection-result {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
}

.detection-result--success {
  background-color: var(--color-success-light, rgba(34, 197, 94, 0.1));
  color: var(--color-success);
}

.detection-result--empty {
  background-color: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

/* CLI 区块 */
.cli-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.cli-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cli-section__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

/* CLI 列表 */
.cli-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.cli-card {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.cli-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4);
  border-bottom: 1px solid var(--color-border);
}

.cli-card__name {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.cli-card__status {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.cli-card__actions {
  display: flex;
  gap: var(--spacing-2);
}

.cli-card__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background-color: transparent;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cli-card__action-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.cli-card__action-btn--danger:hover {
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
}

.cli-card__body {
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.cli-card__row {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-4);
}

.cli-card__label {
  flex-shrink: 0;
  width: 48px;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.cli-card__value {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  word-break: break-all;
  display: flex;
  align-items: center;
}

.cli-card__path {
  font-family: var(--font-family-mono);
  background-color: var(--color-surface);
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-sm);
}

/* 空状态 */
.settings-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-10) var(--spacing-4);
  text-align: center;
}

.settings-empty--compact {
  padding: var(--spacing-6) var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.settings-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-3);
}

.settings-empty__text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-1);
}

.settings-empty__hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

/* 设置卡片 */
.settings-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding: var(--spacing-5);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.settings-card__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  padding-bottom: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
}

/* 帮助说明 */
.help-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.help-section__item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.help-section__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.help-section__value {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  line-height: 1.5;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background-color: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 480px;
  margin: var(--spacing-4);
}

.modal--small {
  max-width: 360px;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.modal__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background-color: transparent;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.modal__close:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.modal__body {
  padding: var(--spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

/* 表单 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.form-input {
  height: 36px;
  padding: 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.form-input:focus {
  border-color: var(--color-primary);
}

.form-input::placeholder {
  color: var(--color-text-tertiary);
}

.form-select {
  height: 36px;
  padding: 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.form-select:focus {
  border-color: var(--color-primary);
}

.form-input-group {
  display: flex;
  gap: var(--spacing-2);
}

.form-input-group .form-input {
  flex: 1;
}

/* 验证状态 */
.validation-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.validation-status--loading {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.validation-status--success {
  background-color: var(--color-success-light, rgba(34, 197, 94, 0.1));
  color: var(--color-success);
}

.validation-status--error {
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
}

.validation-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.validation-spinner svg {
  width: 100%;
  height: 100%;
}

/* 表单错误 */
.form-error {
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

/* 动画 */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
