<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useSettingsStore,
  type MarketSource,
  type MarketSourceType,
  type TestConnectionResult
} from '@/stores/settings'
import { EaButton, EaIcon } from '@/components/common'
import { open } from '@tauri-apps/plugin-dialog'

const { t } = useI18n()
const settingsStore = useSettingsStore()

// Modal state
const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const editingSource = ref<MarketSource | null>(null)

// Form state
const formData = reactive({
  name: '',
  type: 'github' as MarketSourceType,
  url_or_path: ''
})

// Form validation
const formError = ref('')
const nameError = ref('')
const urlError = ref('')

// Test connection state
const isTestingConnection = ref(false)
const testResult = ref<TestConnectionResult | null>(null)

// Card-level test connection state
const testingSourceIds = ref<Set<string>>(new Set())
const cardTestResults = ref<Map<string, TestConnectionResult>>(new Map())

// Delete confirmation state
const showDeleteConfirm = ref(false)
const deletingSource = ref<MarketSource | null>(null)

// Source type options
const sourceTypeOptions = computed(() => [
  { value: 'github', label: t('settings.marketplace.typeGithub'), placeholder: 'owner/repo' },
  { value: 'remote_json', label: t('settings.marketplace.typeRemoteJson'), placeholder: 'https://example.com/marketplace.json' },
  { value: 'local_dir', label: t('settings.marketplace.typeLocalDir'), placeholder: t('settings.marketplace.selectDirectory') }
])

// Computed
const hasSources = computed(() => settingsStore.marketSources.length > 0)
const currentTypeOption = computed(() =>
  sourceTypeOptions.value.find(o => o.value === formData.type)
)

// 表单有效性校验
const isFormValid = computed(() => {
  // 名称必填
  if (!formData.name.trim()) return false

  // URL/路径必填
  if (!formData.url_or_path.trim()) return false

  // 没有错误
  if (nameError.value || urlError.value) return false

  return true
})

// Format relative time
const formatRelativeTime = (dateStr: string | null): string => {
  if (!dateStr) return t('settings.marketplace.neverSynced')

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return t('common.justNow')
  if (diffMinutes < 60) return t('common.minutesAgo', { n: diffMinutes })
  if (diffHours < 24) return t('common.hoursAgo', { n: diffHours })
  return t('common.daysAgo', { n: diffDays })
}

// Get status label
const getStatusLabel = (status: string) => {
  switch (status) {
    case 'active':
      return t('settings.marketplace.statusActive')
    case 'inactive':
      return t('settings.marketplace.statusInactive')
    case 'error':
      return t('settings.marketplace.statusError')
    default:
      return status
  }
}

// Get type label
const getTypeLabel = (type: string) => {
  switch (type) {
    case 'github':
      return t('settings.marketplace.typeGithub')
    case 'remote_json':
      return t('settings.marketplace.typeRemoteJson')
    case 'local_dir':
      return t('settings.marketplace.typeLocalDir')
    default:
      return type
  }
}

// Open add modal
const openAddModal = () => {
  modalMode.value = 'add'
  editingSource.value = null
  resetForm()
  showModal.value = true
}

// Open edit modal
const openEditModal = (source: MarketSource) => {
  modalMode.value = 'edit'
  editingSource.value = source
  resetForm()

  formData.name = source.name
  formData.type = source.type
  formData.url_or_path = source.url_or_path

  showModal.value = true
}

// Close modal
const closeModal = () => {
  showModal.value = false
  editingSource.value = null
  resetForm()
}

// Reset form
const resetForm = () => {
  formData.name = ''
  formData.type = 'github'
  formData.url_or_path = ''
  formError.value = ''
  nameError.value = ''
  urlError.value = ''
  testResult.value = null
  isTestingConnection.value = false
}

// Validate form
const validateForm = (): boolean => {
  formError.value = ''
  nameError.value = ''
  urlError.value = ''

  // Validate name
  if (!formData.name.trim()) {
    nameError.value = t('settings.marketplace.nameRequired')
    return false
  }

  // Check duplicate name
  const isDuplicate = settingsStore.marketSources.some(
    s => s.name === formData.name.trim() && s.id !== editingSource.value?.id
  )
  if (isDuplicate) {
    nameError.value = t('settings.marketplace.nameDuplicate')
    return false
  }

  // Validate URL/path
  if (!formData.url_or_path.trim()) {
    urlError.value = t('settings.marketplace.urlOrPathRequired')
    return false
  }

  // Validate GitHub format
  if (formData.type === 'github') {
    const parts = formData.url_or_path.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      urlError.value = t('settings.marketplace.githubFormatError')
      return false
    }
  }

  return true
}

// Test connection
const handleTestConnection = async () => {
  if (!formData.url_or_path.trim()) {
    urlError.value = t('settings.marketplace.urlOrPathRequired')
    return
  }

  // Validate GitHub format before testing
  if (formData.type === 'github') {
    const parts = formData.url_or_path.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      urlError.value = t('settings.marketplace.githubFormatError')
      return
    }
  }

  isTestingConnection.value = true
  testResult.value = null

  try {
    testResult.value = await settingsStore.testMarketSourceConnection(
      formData.type,
      formData.url_or_path
    )
  } catch (error) {
    testResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '测试失败'
    }
  } finally {
    isTestingConnection.value = false
  }
}

// Test connection for a specific source card
const handleCardTestConnection = async (source: MarketSource) => {
  testingSourceIds.value.add(source.id)
  cardTestResults.value.delete(source.id)

  try {
    const result = await settingsStore.testAndUpdateMarketSource(source.id)
    cardTestResults.value.set(source.id, result)

    // Auto-hide success message after 3 seconds
    if (result.success) {
      setTimeout(() => {
        cardTestResults.value.delete(source.id)
      }, 3000)
    }
  } catch (error) {
    cardTestResults.value.set(source.id, {
      success: false,
      message: error instanceof Error ? error.message : '测试失败'
    })
  } finally {
    testingSourceIds.value.delete(source.id)
  }
}

// Submit form
const handleSubmit = async () => {
  if (!validateForm()) {
    return
  }

  try {
    const input = {
      name: formData.name.trim(),
      type: formData.type,
      url_or_path: formData.url_or_path.trim()
    }

    if (modalMode.value === 'add') {
      await settingsStore.addMarketSource(input)
    } else if (editingSource.value) {
      await settingsStore.updateMarketSource(
        editingSource.value.id,
        input,
        editingSource.value.enabled
      )
    }

    closeModal()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存失败，请重试'
    console.error('Save failed:', error)
  }
}

// Toggle source status
const handleToggle = async (source: MarketSource) => {
  try {
    await settingsStore.toggleMarketSource(source.id, !source.enabled)
  } catch (error) {
    console.error('Toggle failed:', error)
  }
}

// Request delete
const requestDelete = (source: MarketSource) => {
  deletingSource.value = source
  showDeleteConfirm.value = true
}

// Confirm delete
const confirmDelete = async () => {
  if (!deletingSource.value) return

  try {
    await settingsStore.deleteMarketSource(deletingSource.value.id)
    showDeleteConfirm.value = false
    deletingSource.value = null
  } catch (error) {
    console.error('Delete failed:', error)
  }
}

// Cancel delete
const cancelDelete = () => {
  showDeleteConfirm.value = false
  deletingSource.value = null
}

// Select local directory
const selectLocalDirectory = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择包含 marketplace.json 的目录'
    })
    if (selected && typeof selected === 'string') {
      formData.url_or_path = selected
    }
  } catch (error) {
    console.error('Failed to select directory:', error)
  }
}

// Handle type change
const handleTypeChange = () => {
  formData.url_or_path = ''
  testResult.value = null
}

// Component mount
onMounted(() => {
  settingsStore.loadMarketSources()
})
</script>

<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <h3 class="settings-page__title">
        {{ t('settings.marketplace.title') }}
      </h3>
      <EaButton
        type="primary"
        size="small"
        @click="openAddModal"
      >
        <EaIcon
          name="plus"
          :size="16"
        />
        {{ t('settings.marketplace.addSource') }}
      </EaButton>
    </div>

    <div
      v-if="settingsStore.isLoadingMarketSources"
      class="loading-state"
    >
      <div class="loading-spinner">
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
      <span>{{ t('settings.marketplace.loading') }}</span>
    </div>

    <div
      v-else-if="!hasSources"
      class="settings-empty"
    >
      <EaIcon
        name="globe"
        :size="48"
        class="settings-empty__icon"
      />
      <p class="settings-empty__text">
        {{ t('settings.marketplace.noSources') }}
      </p>
      <p class="settings-empty__hint">
        {{ t('settings.marketplace.noSourcesHint') }}
      </p>
    </div>

    <div
      v-else
      class="source-list"
    >
      <div
        v-for="source in settingsStore.marketSources"
        :key="source.id"
        class="source-card"
      >
        <div class="source-card__header">
          <div class="source-card__icon">
            <EaIcon
              :name="source.type === 'github' ? 'github' : source.type === 'remote_json' ? 'cloud' : 'folder'"
              :size="20"
            />
          </div>
          <div class="source-card__info">
            <div class="source-card__title-row">
              <span class="source-card__name">{{ source.name }}</span>
              <span class="source-card__type">{{ getTypeLabel(source.type) }}</span>
              <span :class="['source-card__status', `source-card__status--${source.status}`]">
                {{ getStatusLabel(source.status) }}
              </span>
            </div>
            <div class="source-card__url">
              {{ source.url_or_path }}
            </div>
          </div>
        </div>
        <div class="source-card__footer">
          <div class="source-card__sync">
            <EaIcon
              name="clock"
              :size="14"
            />
            <span>{{ t('settings.marketplace.lastSynced') }}: {{ formatRelativeTime(source.last_synced_at) }}</span>
          </div>
          <div class="source-card__actions">
            <button
              :class="['toggle-btn', { 'toggle-btn--active': source.enabled }]"
              :title="source.enabled ? t('settings.marketplace.disable') : t('settings.marketplace.enable')"
              @click="handleToggle(source)"
            >
              <span class="toggle-btn__track">
                <span class="toggle-btn__thumb" />
              </span>
            </button>
            <EaButton
              type="ghost"
              size="small"
              :loading="testingSourceIds.has(source.id)"
              @click="handleCardTestConnection(source)"
            >
              <EaIcon
                name="zap"
                :size="14"
              />
              {{ t('settings.marketplace.testConnection') }}
            </EaButton>
            <EaButton
              type="ghost"
              size="small"
              @click="openEditModal(source)"
            >
              {{ t('settings.marketplace.edit') }}
            </EaButton>
            <EaButton
              type="ghost"
              size="small"
              @click="requestDelete(source)"
            >
              {{ t('settings.marketplace.delete') }}
            </EaButton>
          </div>
        </div>
        <!-- Card test result -->
        <div
          v-if="cardTestResults.has(source.id)"
          :class="['source-card__test-result', { 'source-card__test-result--success': cardTestResults.get(source.id)?.success, 'source-card__test-result--error': !cardTestResults.get(source.id)?.success }]"
        >
          <EaIcon
            :name="cardTestResults.get(source.id)?.success ? 'check-circle' : 'x-circle'"
            :size="14"
          />
          <span>{{ cardTestResults.get(source.id)?.message }}</span>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModal"
          class="modal-overlay"
          @click.self="closeModal"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <div class="source-form">
              <div class="source-form__header">
                <h3 class="source-form__title">
                  {{ editingSource ? t('settings.marketplace.editTitle') : t('settings.marketplace.addTitle') }}
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

              <div class="source-form__body">
                <!-- Name -->
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.marketplace.nameLabel') }} <span class="form-required">*</span>
                  </label>
                  <input
                    v-model="formData.name"
                    type="text"
                    class="form-input"
                    :class="{ 'form-input--error': nameError }"
                    :placeholder="t('settings.marketplace.namePlaceholder')"
                    maxlength="50"
                  >
                  <span
                    v-if="nameError"
                    class="form-error-text"
                  >{{ nameError }}</span>
                </div>

                <!-- Type -->
                <div class="form-group">
                  <label class="form-label">
                    {{ t('settings.marketplace.typeLabel') }} <span class="form-required">*</span>
                  </label>
                  <div class="type-options">
                    <button
                      v-for="option in sourceTypeOptions"
                      :key="option.value"
                      :class="['type-option', { 'type-option--active': formData.type === option.value }]"
                      type="button"
                      @click="formData.type = option.value as MarketSourceType; handleTypeChange()"
                    >
                      <EaIcon
                        :name="option.value === 'github' ? 'github' : option.value === 'remote_json' ? 'cloud' : 'folder'"
                        :size="18"
                      />
                      <span>{{ option.label }}</span>
                    </button>
                  </div>
                </div>

                <!-- URL/Path -->
                <div class="form-group">
                  <label class="form-label">
                    {{ formData.type === 'local_dir' ? t('settings.marketplace.pathLabel') : t('settings.marketplace.urlLabel') }}
                    <span class="form-required">*</span>
                  </label>
                  <div class="url-input-group">
                    <input
                      v-model="formData.url_or_path"
                      type="text"
                      class="form-input"
                      :class="{ 'form-input--error': urlError }"
                      :placeholder="currentTypeOption?.placeholder"
                    >
                    <EaButton
                      v-if="formData.type === 'local_dir'"
                      type="secondary"
                      @click="selectLocalDirectory"
                    >
                      {{ t('settings.marketplace.selectDirectory') }}
                    </EaButton>
                  </div>
                  <span
                    v-if="urlError"
                    class="form-error-text"
                  >{{ urlError }}</span>
                  <span
                    v-else-if="formData.type === 'github'"
                    class="form-hint"
                  >
                    {{ t('settings.marketplace.githubHint') }}
                  </span>
                </div>

                <!-- Test Connection -->
                <div class="form-group">
                  <EaButton
                    type="secondary"
                    :loading="isTestingConnection"
                    :disabled="!formData.url_or_path.trim()"
                    @click="handleTestConnection"
                  >
                    <EaIcon
                      name="zap"
                      :size="16"
                    />
                    {{ t('settings.marketplace.testConnection') }}
                  </EaButton>

                  <div
                    v-if="testResult"
                    :class="['test-result', { 'test-result--success': testResult.success, 'test-result--error': !testResult.success }]"
                  >
                    <EaIcon
                      :name="testResult.success ? 'check-circle' : 'x-circle'"
                      :size="16"
                    />
                    <span>{{ testResult.message }}</span>
                  </div>
                </div>

                <!-- Global Error -->
                <div
                  v-if="formError"
                  class="form-error-block"
                >
                  {{ formError }}
                </div>
              </div>

              <div class="source-form__actions">
                <EaButton
                  type="secondary"
                  @click="closeModal"
                >
                  {{ t('common.cancel') }}
                </EaButton>
                <EaButton
                  type="primary"
                  :disabled="!isFormValid"
                  @click="handleSubmit"
                >
                  {{ editingSource ? t('common.save') : t('common.create') }}
                </EaButton>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteConfirm"
          class="modal-overlay"
          @click.self="cancelDelete"
        >
          <div
            class="modal-container modal-container--small"
            @click.stop
          >
            <div class="source-form">
              <div class="source-form__header">
                <h3 class="source-form__title">
                  {{ t('settings.marketplace.confirmDelete') }}
                </h3>
              </div>
              <div class="source-form__body">
                <p>{{ t('settings.marketplace.confirmDeleteMessage', { name: deletingSource?.name }) }}</p>
              </div>
              <div class="source-form__actions">
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
        </div>
      </Transition>
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

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-8);
  color: var(--color-text-secondary);
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-primary);
}

.loading-spinner svg {
  width: 100%;
  height: 100%;
}

.settings-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-10) var(--spacing-4);
  text-align: center;
}

.settings-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
}

.settings-empty__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.settings-empty__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.source-card {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  transition: border-color var(--transition-fast);
}

.source-card:hover {
  border-color: var(--color-border-hover, var(--color-border));
}

.source-card__header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  margin-bottom: var(--spacing-3);
}

.source-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  flex-shrink: 0;
}

.source-card__info {
  flex: 1;
  min-width: 0;
}

.source-card__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-1);
}

.source-card__name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.source-card__type {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.source-card__status {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
}

.source-card__status--active {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.source-card__status--error {
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
}

.source-card__url {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--color-border);
}

.source-card__sync {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.source-card__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

/* Card test result */
.source-card__test-result {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-3);
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-xs);
  border-radius: var(--radius-md);
}

.source-card__test-result--success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.source-card__test-result--error {
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
}

/* Toggle button */
.toggle-btn {
  display: flex;
  align-items: center;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.toggle-btn__track {
  display: block;
  width: 36px;
  height: 20px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  position: relative;
  transition: background-color var(--transition-fast);
}

.toggle-btn--active .toggle-btn__track {
  background-color: var(--color-primary);
}

.toggle-btn__thumb {
  display: block;
  width: 16px;
  height: 16px;
  background-color: var(--color-surface);
  border-radius: var(--radius-full);
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

.toggle-btn--active .toggle-btn__thumb {
  transform: translateX(16px);
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.modal-container--small {
  width: 400px;
}

.source-form {
  display: flex;
  flex-direction: column;
}

.source-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.source-form__title {
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

.source-form__body {
  padding: var(--spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.source-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

/* Form styles */
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

.form-required {
  color: var(--color-error, #ef4444);
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

.form-input--error {
  border-color: var(--color-error, #ef4444);
}

.form-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.form-error-text {
  font-size: var(--font-size-xs);
  color: var(--color-error, #ef4444);
}

.form-error-block {
  padding: var(--spacing-3);
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

/* Type options */
.type-options {
  display: flex;
  gap: var(--spacing-2);
}

.type-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.type-option:hover {
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.type-option--active {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

/* URL input group */
.url-input-group {
  display: flex;
  gap: var(--spacing-2);
}

.url-input-group .form-input {
  flex: 1;
}

/* Test result */
.test-result {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-md);
}

.test-result--success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.test-result--error {
  background-color: var(--color-error-light, rgba(239, 68, 68, 0.1));
  color: var(--color-error, #ef4444);
}

/* Animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
  opacity: 0;
}

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
