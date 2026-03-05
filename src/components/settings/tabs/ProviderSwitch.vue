<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useProviderProfileStore,
  type ProviderProfile,
  type CliType,
  type CreateProviderProfileInput,
  type UpdateProviderProfileInput
} from '@/stores/providerProfile'
import { EaButton, EaIcon } from '@/components/common'
import ProviderProfileForm from './ProviderProfileForm.vue'

const { t } = useI18n()
const store = useProviderProfileStore()

// 当前 CLI 类型
const currentCliType = ref<CliType>('claude')

// 表单弹窗状态
const showFormModal = ref(false)
const editingProfile = ref<ProviderProfile | null>(null)

// 删除确认状态
const showDeleteConfirm = ref(false)
const deletingProfile = ref<ProviderProfile | null>(null)

// 加载状态
const switchingId = ref<string | null>(null)

// API Key 显示状态（明文/加密）
const showApiKey = ref(false)

// 当前类型的配置列表
const currentProfiles = computed(() =>
  currentCliType.value === 'claude' ? store.claudeProfiles : store.codexProfiles
)

// 当前激活的配置
const currentActiveProfile = computed(() =>
  currentCliType.value === 'claude' ? store.activeClaudeProfile : store.activeCodexProfile
)

// 当前 CLI 连接信息
const currentConnection = computed(() =>
  currentCliType.value === 'claude' ? store.claudeConnection : store.codexConnection
)

// 切换 CLI 类型
function handleCliTypeChange(type: CliType) {
  currentCliType.value = type
  store.currentCliType = type
}

// 打开添加弹窗
function handleAdd() {
  editingProfile.value = null
  showFormModal.value = true
}

// 打开编辑弹窗
function handleEdit(profile: ProviderProfile) {
  editingProfile.value = { ...profile }
  showFormModal.value = true
}

// 切换配置
async function handleSwitch(profile: ProviderProfile) {
  switchingId.value = profile.id
  try {
    await store.switchProfile(profile.id)
    // 显示成功提示
    showSuccess(t('settings.providerSwitch.messages.switchSuccess'))
  } catch (error) {
    console.error('Switch failed:', error)
    showError(t('settings.providerSwitch.messages.switchFailed'))
  } finally {
    switchingId.value = null
  }
}

// 确认删除
function handleDeleteConfirm(profile: ProviderProfile) {
  deletingProfile.value = profile
  showDeleteConfirm.value = true
}

// 执行删除
async function handleDelete() {
  if (!deletingProfile.value) return

  try {
    await store.deleteProfile(deletingProfile.value.id)
    showDeleteConfirm.value = false
    deletingProfile.value = null
    showSuccess(t('settings.providerSwitch.messages.deleteSuccess'))
  } catch (error) {
    console.error('Delete failed:', error)
    showError(t('settings.providerSwitch.messages.deleteFailed'))
  }
}

// 保存配置
async function handleSave(input: CreateProviderProfileInput | UpdateProviderProfileInput) {
  try {
    if (editingProfile.value) {
      await store.updateProfile(editingProfile.value.id, input as UpdateProviderProfileInput)
      showSuccess(t('settings.providerSwitch.messages.updateSuccess'))
    } else {
      await store.createProfile(input as CreateProviderProfileInput)
      showSuccess(t('settings.providerSwitch.messages.createSuccess'))
    }
    showFormModal.value = false
    editingProfile.value = null
  } catch (error) {
    console.error('Save failed:', error)
    if (editingProfile.value) {
      showError(t('settings.providerSwitch.messages.updateFailed'))
    } else {
      showError(t('settings.providerSwitch.messages.createFailed'))
    }
    throw error
  }
}

// 简单的成功/错误提示
function showSuccess(message: string) {
  // 这里可以使用 notification store 或者其他方式显示提示
  console.log('Success:', message)
}

function showError(message: string) {
  console.error('Error:', message)
}

// 初始化
onMounted(async () => {
  await store.loadProfiles()
  // 读取所有 CLI 连接信息
  await store.readAllCliConnections()
})

// 监听 CLI 类型变化
watch(currentCliType, async (type) => {
  await store.loadActiveProfile(type)
  await store.readCurrentConfig(type)
  // 重新读取当前 CLI 的连接信息
  await store.readCliConnectionInfo(type)
}, { immediate: true })
</script>

<template>
  <div class="provider-switch">
    <!-- 标题和描述 -->
    <div class="header">
      <h2 class="title">{{ t('settings.providerSwitch.title') }}</h2>
      <p class="description">{{ t('settings.providerSwitch.description') }}</p>
    </div>

    <!-- CLI 类型切换 -->
    <div class="cli-type-tabs">
      <div class="tabs-wrapper">
        <button
          :class="['tab-btn', { active: currentCliType === 'claude' }]"
          @click="handleCliTypeChange('claude')"
        >
          <EaIcon name="terminal" :size="16" />
          <span>{{ t('settings.providerSwitch.cliType.claude') }}</span>
        </button>
        <button
          :class="['tab-btn', { active: currentCliType === 'codex' }]"
          @click="handleCliTypeChange('codex')"
        >
          <EaIcon name="code" :size="16" />
          <span>{{ t('settings.providerSwitch.cliType.codex') }}</span>
        </button>
      </div>
    </div>

    <!-- 当前 CLI 连接信息 -->
    <div class="cli-connection section">
      <h3 class="section-title">{{ t('settings.providerSwitch.currentFileConfig') }}</h3>
      <div v-if="store.isLoadingConnections" class="loading">
        <EaIcon name="loading" spin :size="20" />
        <span>{{ t('common.loading') }}</span>
      </div>
      <div v-else-if="currentConnection" class="connection-card">
        <div class="connection-header">
          <div class="connection-name">
            <EaIcon
              :name="currentConnection.isValid ? 'check-circle' : 'alert-circle'"
              :class="currentConnection.isValid ? 'valid-icon' : 'invalid-icon'"
              :size="18"
            />
            {{ currentConnection.displayName }}
          </div>
          <span
            class="status-badge"
            :class="currentConnection.isValid ? 'status-valid' : 'status-invalid'"
          >
            {{ currentConnection.isValid ? t('settings.providerSwitch.connectionValid') : t('settings.providerSwitch.connectionInvalid') }}
          </span>
        </div>
        <div class="connection-body">
          <div class="connection-row">
            <span class="connection-label">{{ t('settings.providerSwitch.configFile') }}</span>
            <span class="connection-value mono">{{ currentConnection.configFile }}</span>
          </div>
          <div class="connection-row">
            <span class="connection-label">{{ t('settings.providerSwitch.settingsFile') }}</span>
            <span class="connection-value mono">{{ currentConnection.settingsFile }}</span>
          </div>
          <div v-if="currentConnection.baseUrl" class="connection-row">
            <span class="connection-label">{{ t('settings.providerSwitch.form.baseUrl') }}</span>
            <span class="connection-value mono">{{ currentConnection.baseUrl }}</span>
          </div>
          <div v-if="currentConnection.mainModel" class="connection-row">
            <span class="connection-label">{{ t('settings.providerSwitch.form.mainModel') }}</span>
            <span class="connection-value mono">{{ currentConnection.mainModel }}</span>
          </div>
          <div v-if="currentConnection.apiKeyMasked" class="connection-row">
            <span class="connection-label">{{ t('settings.providerSwitch.form.apiKey') }}</span>
            <div class="connection-value-with-action">
              <span class="connection-value mono masked">{{ showApiKey ? currentConnection.apiKey : currentConnection.apiKeyMasked }}</span>
              <button
                class="toggle-visibility-btn"
                :title="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                @click="showApiKey = !showApiKey"
              >
                <EaIcon :name="showApiKey ? 'eye-off' : 'eye'" :size="14" />
              </button>
            </div>
          </div>
          <div v-if="currentConnection.errorMessage" class="connection-error">
            <EaIcon name="alert-triangle" :size="14" />
            <span>{{ currentConnection.errorMessage }}</span>
          </div>
        </div>
      </div>
      <div v-else class="no-connection">
        <EaIcon name="info" :size="16" />
        <span>{{ t('settings.providerSwitch.noConnectionInfo') }}</span>
      </div>
    </div>

    <!-- 当前激活配置 -->
    <div class="current-config section">
      <h3 class="section-title">{{ t('settings.providerSwitch.currentConfig') }}</h3>
      <div v-if="currentActiveProfile" class="active-profile-card">
        <div class="profile-info">
          <div class="profile-name">
            <EaIcon name="check-circle" class="active-icon" :size="18" />
            {{ currentActiveProfile.name }}
          </div>
          <div class="profile-details">
            <span v-if="currentActiveProfile.baseUrl">{{ currentActiveProfile.baseUrl }}</span>
            <span v-if="currentActiveProfile.mainModel">{{ currentActiveProfile.mainModel }}</span>
            <span v-if="currentActiveProfile.codexModel">{{ currentActiveProfile.codexModel }}</span>
          </div>
        </div>
        <div class="profile-actions">
          <EaButton size="small" @click="handleEdit(currentActiveProfile)">
            <EaIcon name="edit" :size="14" />
            {{ t('settings.providerSwitch.edit') }}
          </EaButton>
        </div>
      </div>
      <div v-else class="no-active-config">
        <EaIcon name="info" :size="16" />
        <span>{{ t('settings.providerSwitch.noActiveConfig') }}</span>
      </div>
    </div>

    <!-- 配置列表 -->
    <div class="profiles-list section">
      <div class="section-header">
        <h3 class="section-title">{{ t('settings.providerSwitch.profiles') }}</h3>
        <EaButton type="primary" size="small" @click="handleAdd">
          <EaIcon name="plus" :size="14" />
          {{ t('settings.providerSwitch.addProfile') }}
        </EaButton>
      </div>

      <div v-if="store.isLoading" class="loading">
        <EaIcon name="loading" spin :size="24" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="currentProfiles.length === 0" class="empty-state">
        <EaIcon name="folder-open" :size="48" />
        <p>{{ t('settings.providerSwitch.noProfiles') }}</p>
        <p class="hint">{{ t('settings.providerSwitch.noProfilesHint') }}</p>
      </div>

      <div v-else class="profile-cards">
        <div
          v-for="profile in currentProfiles"
          :key="profile.id"
          class="profile-card"
          :class="{ active: profile.isActive }"
        >
          <div class="profile-info">
            <div class="profile-name">
              <EaIcon v-if="profile.isActive" name="check-circle" class="active-icon" :size="18" />
              {{ profile.name }}
              <span v-if="profile.isActive" class="badge active-badge">
                {{ t('settings.providerSwitch.active') }}
              </span>
            </div>
            <div class="profile-details">
              <span v-if="profile.baseUrl">{{ profile.baseUrl }}</span>
              <span v-if="profile.mainModel">{{ profile.mainModel }}</span>
              <span v-if="profile.codexModel">{{ profile.codexModel }}</span>
            </div>
          </div>
          <div class="profile-actions">
            <EaButton
              v-if="!profile.isActive"
              type="primary"
              size="small"
              :loading="switchingId === profile.id"
              @click="handleSwitch(profile)"
            >
              {{ t('settings.providerSwitch.switch') }}
            </EaButton>
            <EaButton size="small" @click="handleEdit(profile)">
              <EaIcon name="edit" :size="14" />
            </EaButton>
            <EaButton size="small" type="danger" @click="handleDeleteConfirm(profile)">
              <EaIcon name="trash" :size="14" />
            </EaButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 表单弹窗 -->
    <ProviderProfileForm
      v-model:visible="showFormModal"
      :profile="editingProfile"
      :cli-type="currentCliType"
      @save="handleSave"
    />

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteConfirm" class="confirm-overlay" @click.self="showDeleteConfirm = false">
      <div class="confirm-dialog">
        <h3>{{ t('settings.providerSwitch.confirmDelete') }}</h3>
        <p>{{ t('settings.providerSwitch.confirmDeleteMessage', { name: deletingProfile?.name }) }}</p>
        <div class="confirm-actions">
          <EaButton @click="showDeleteConfirm = false">
            {{ t('common.cancel') }}
          </EaButton>
          <EaButton type="danger" @click="handleDelete">
            {{ t('common.delete') }}
          </EaButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.provider-switch {
  padding: 16px;
}

.header {
  margin-bottom: 24px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--color-text-primary, #1a1a1a);
}

.description {
  color: var(--color-text-secondary, #666);
  font-size: 14px;
}

/* CLI 类型切换标签 */
.cli-type-tabs {
  margin-bottom: 24px;
}

.tabs-wrapper {
  display: inline-flex;
  gap: 4px;
  background: var(--color-bg-secondary, #f5f5f5);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--color-border, #e0e0e0);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text-secondary, #666);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));
  color: var(--color-text-primary, #1a1a1a);
}

.tab-btn.active {
  background: var(--color-primary, #7c3aed);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
}

.tab-btn.active:hover {
  background: var(--color-primary-dark, #6d28d9);
}

/* 深色模式适配 */
:global(.dark) .tabs-wrapper {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-border, #404040);
}

:global(.dark) .tab-btn {
  color: var(--color-text-secondary, #a0a0a0);
}

:global(.dark) .tab-btn:hover {
  background: var(--color-surface-hover, rgba(255, 255, 255, 0.1));
  color: var(--color-text-primary, #ffffff);
}

:global(.dark) .tab-btn.active {
  background: var(--color-primary, #8b5cf6);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
}

.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a1a);
}

/* CLI 连接信息卡片 */
.cli-connection {
  margin-bottom: 24px;
}

.connection-card {
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px solid var(--color-border, #e0e0e0);
  overflow: hidden;
}

:global(.dark) .connection-card {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-border, #404040);
}

.connection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-surface, #ffffff);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
}

:global(.dark) .connection-header {
  background: var(--color-bg-tertiary, #363636);
  border-color: var(--color-border, #404040);
}

.connection-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a1a);
}

:global(.dark) .connection-name {
  color: var(--color-text-primary, #ffffff);
}

.valid-icon {
  color: var(--color-success, #22c55e);
}

.invalid-icon {
  color: var(--color-warning, #f59e0b);
}

.status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.status-valid {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

:global(.dark) .status-valid {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border-color: rgba(34, 197, 94, 0.4);
}

.status-invalid {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

:global(.dark) .status-invalid {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.4);
}

.connection-body {
  padding: 12px 16px;
}

.connection-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border, #e0e0e0);
}

.connection-row:last-child {
  border-bottom: none;
}

:global(.dark) .connection-row {
  border-color: var(--color-border, #404040);
}

.connection-label {
  flex-shrink: 0;
  width: 100px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}

:global(.dark) .connection-label {
  color: var(--color-text-secondary, #a0a0a0);
}

.connection-value {
  font-size: 13px;
  color: var(--color-text-primary, #1a1a1a);
  word-break: break-all;
}

:global(.dark) .connection-value {
  color: var(--color-text-primary, #ffffff);
}

.connection-value.mono {
  font-family: var(--font-family-mono, monospace);
  background: var(--color-surface, #ffffff);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

:global(.dark) .connection-value.mono {
  background: var(--color-bg-tertiary, #363636);
}

.connection-value.masked {
  color: var(--color-text-tertiary, #888);
}

.connection-value-with-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.connection-value-with-action .connection-value {
  flex: 1;
}

.toggle-visibility-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary, #666);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-visibility-btn:hover {
  background: var(--color-primary-light, rgba(124, 58, 237, 0.1));
  color: var(--color-primary, #7c3aed);
}

:global(.dark) .toggle-visibility-btn {
  background: var(--color-surface-hover, rgba(255, 255, 255, 0.1));
  color: var(--color-text-secondary, #a0a0a0);
}

:global(.dark) .toggle-visibility-btn:hover {
  background: var(--color-primary-light, rgba(139, 92, 246, 0.2));
  color: var(--color-primary, #8b5cf6);
}

.connection-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  color: var(--color-error, #dc2626);
  font-size: 13px;
}

:global(.dark) .connection-error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.no-connection {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px dashed var(--color-border, #e0e0e0);
  color: var(--color-text-secondary, #666);
}

:global(.dark) .no-connection {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-border, #404040);
  color: var(--color-text-secondary, #a0a0a0);
}

.active-profile-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 2px solid var(--color-primary, #7c3aed);
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.15);
}

:global(.dark) .active-profile-card {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-primary, #8b5cf6);
}

.active-icon {
  color: var(--color-success, #22c55e);
}

.no-active-config {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px dashed var(--color-border, #e0e0e0);
  color: var(--color-text-secondary, #666);
}

:global(.dark) .no-active-config {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-border, #404040);
  color: var(--color-text-secondary, #a0a0a0);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  color: var(--color-text-secondary, #666);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px dashed var(--color-border, #e0e0e0);
  color: var(--color-text-secondary, #666);
}

:global(.dark) .empty-state {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-border, #404040);
  color: var(--color-text-secondary, #a0a0a0);
}

.empty-state .hint {
  font-size: 12px;
}

.profile-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.profile-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px solid var(--color-border, #e0e0e0);
  transition: all 0.2s ease;
}

.profile-card:hover {
  border-color: var(--color-primary, #7c3aed);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

:global(.dark) .profile-card {
  background: var(--color-bg-secondary, #2a2a2a);
  border-color: var(--color-border, #404040);
}

:global(.dark) .profile-card:hover {
  border-color: var(--color-primary, #8b5cf6);
}

.profile-card.active {
  border-color: var(--color-primary, #7c3aed);
  border-width: 2px;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(124, 58, 237, 0.02) 100%);
}

:global(.dark) .profile-card.active {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%);
  border-color: var(--color-primary, #8b5cf6);
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a1a);
}

:global(.dark) .profile-name {
  color: var(--color-text-primary, #ffffff);
}

.profile-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

:global(.dark) .profile-details {
  color: var(--color-text-secondary, #a0a0a0);
}

.profile-details span {
  padding: 3px 8px;
  background: var(--color-surface, #ffffff);
  border-radius: 6px;
  border: 1px solid var(--color-border, #e0e0e0);
  font-family: monospace;
}

:global(.dark) .profile-details span {
  background: var(--color-bg-tertiary, #363636);
  border-color: var(--color-border, #505050);
}

.profile-actions {
  display: flex;
  gap: 8px;
}

.badge {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.active-badge {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

:global(.dark) .active-badge {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border-color: rgba(34, 197, 94, 0.4);
}

.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-dialog {
  background: var(--color-bg-primary, #ffffff);
  border-radius: 16px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

:global(.dark) .confirm-dialog {
  background: var(--color-bg-primary, #1a1a1a);
}

.confirm-dialog h3 {
  margin-bottom: 12px;
  color: var(--color-text-primary, #1a1a1a);
}

:global(.dark) .confirm-dialog h3 {
  color: var(--color-text-primary, #ffffff);
}

.confirm-dialog p {
  color: var(--color-text-secondary, #666);
  margin-bottom: 20px;
}

:global(.dark) .confirm-dialog p {
  color: var(--color-text-secondary, #a0a0a0);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
