<script setup lang="ts">
/**
 * 子代理配置页：管理用户自建的 ACP CLI 子代理（claude / opencode）。
 * - 系统级 / 内置子代理不显示。
 * - 仅显示「名称 + 提示词」编辑表单。
 * - 复用 EaButton / workspace token，与软件主题一致。
 */
import { useI18n } from 'vue-i18n'
import { useSubAgentConfig } from './useSubAgentConfig'
import { EaButton, EaIcon, EaActionMenu } from '@/components/common'

const { t } = useI18n()
const {
  searchQuery,
  isCreating,
  isSaving,
  form,
  selectedCliType,
  cliTypeOptions,
  writeTargetDir,
  filteredSubAgents,
  selectedSubAgent,
  subAgentStore,
  selectSubAgent,
  handleCreate,
  handleCopy,
  handleSave,
  handleDelete,
  handleCliTypeChange
} = useSubAgentConfig()

// 溢出菜单操作（复制 / 删除），避免模板内联回调的 null 类型问题
function handleSubAgentAction(key: string) {
  if (!selectedSubAgent.value) return
  if (key === 'copy') handleCopy(selectedSubAgent.value)
  else if (key === 'delete') handleDelete(selectedSubAgent.value)
}
</script>

<template>
  <div class="sub-agent-page">
    <!-- CLI 类型 Tab（下划线风格） -->
    <section class="cli-type-tabs">
      <div class="tabs-wrapper">
        <button
          v-for="option in cliTypeOptions"
          :key="option.value"
          :class="['tab-btn', { active: selectedCliType === option.value }]"
          @click="handleCliTypeChange(option.value)"
        >
          <EaIcon
            name="terminal"
            :size="14"
          />
          <span>{{ option.label }}</span>
        </button>
      </div>
      <p class="cli-type-tabs__hint">
        {{ t('settings.subAgents.diskHint', { dir: writeTargetDir }) }}
      </p>
    </section>

    <div class="sub-agent-page__body">
      <!-- 左侧列表 -->
      <aside class="sub-agent-sidebar">
        <div class="sub-agent-sidebar__header">
          <h3>{{ t('settings.subAgents.title') }}</h3>
          <EaButton
            type="primary"
            size="small"
            :icon="'plus'"
            @click="handleCreate"
          >
            {{ t('settings.subAgents.create') }}
          </EaButton>
        </div>

        <input
          v-model="searchQuery"
          class="search-input"
          type="text"
          :placeholder="t('settings.subAgents.searchPlaceholder')"
        >

        <div class="sub-agent-list">
          <button
            v-for="subAgent in filteredSubAgents"
            :key="subAgent.id"
            class="sub-agent-list__item"
            :class="{ 'sub-agent-list__item--active': subAgent.id === subAgentStore.selectedSubAgentId && !isCreating }"
            @click="selectSubAgent(subAgent.id)"
          >
            <span class="sub-agent-list__dot" />
            <span class="sub-agent-list__title">{{ subAgent.name }}</span>
          </button>

          <p
            v-if="filteredSubAgents.length === 0"
            class="sub-agent-list__empty"
          >
            {{ t('settings.subAgents.emptyUserList') }}
          </p>
        </div>
      </aside>

      <!-- 右侧编辑区 -->
      <section class="sub-agent-editor">
        <div class="sub-agent-editor__header">
          <h3>{{ isCreating ? t('settings.subAgents.createTitle') : (selectedSubAgent?.name || t('settings.subAgents.editTitle')) }}</h3>
          <div
            v-if="selectedSubAgent"
            class="sub-agent-editor__actions"
          >
            <EaActionMenu
              :items="[
                { key: 'copy', label: t('settings.subAgents.copy'), icon: 'copy' },
                { key: 'delete', label: t('settings.subAgents.delete'), icon: 'trash-2', danger: true, disabled: selectedSubAgent.isBuiltin || selectedSubAgent.isSystem }
              ]"
              @select="handleSubAgentAction"
            />
          </div>
        </div>

        <!-- 表单：名称 + 提示词 -->
        <div class="editor-form">
          <label class="editor-form__field">
            <span class="editor-form__label">{{ t('settings.subAgents.fields.name') }}</span>
            <input
              v-model="form.name"
              type="text"
              class="text-input"
            >
          </label>
          <label class="editor-form__field editor-form__field--grow">
            <span class="editor-form__label">{{ t('settings.subAgents.fields.prompt') }}</span>
            <textarea
              v-model="form.prompt"
              class="prompt-input"
              rows="18"
            />
          </label>
        </div>

        <div class="editor-footer">
          <EaButton
            type="primary"
            :loading="isSaving"
            @click="handleSave"
          >
            {{ isSaving ? t('settings.subAgents.saving') : t('settings.subAgents.save') }}
          </EaButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sub-agent-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: var(--spacing-3);
}

/* ---------- CLI 类型 Tab（下划线风格） ---------- */
.cli-type-tabs {
  flex-shrink: 0;
}

.tabs-wrapper {
  display: inline-flex;
  gap: var(--spacing-1);
  border-bottom: 1px solid var(--workspace-border, var(--color-border));
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  margin-bottom: -1px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.tab-btn:hover {
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.tab-btn.active {
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-weight: var(--font-weight-semibold);
  border-bottom-color: var(--workspace-text-primary, var(--color-text-primary));
}

.cli-type-tabs__hint {
  margin: var(--spacing-2) 0 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

/* ---------- 主体布局 ---------- */
.sub-agent-page__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: var(--spacing-3);
  overflow: hidden;
  overscroll-behavior: none;
}

.sub-agent-sidebar,
.sub-agent-editor {
  display: flex;
  flex-direction: column;
  background: var(--workspace-panel-bg, var(--color-bg-secondary));
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-lg);
  padding: var(--spacing-3);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  overscroll-behavior: none;
}

/* ---------- 左侧列表 ---------- */
.sub-agent-sidebar__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-2);
}

.sub-agent-sidebar__header h3 {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.search-input {
  width: 100%;
  margin-bottom: var(--spacing-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  padding: var(--spacing-2) var(--spacing-3);
  font: inherit;
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.sub-agent-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  overscroll-behavior: contain;
}

.sub-agent-list__item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  text-align: left;
}

.sub-agent-list__item:hover {
  background: var(--workspace-list-hover-bg, var(--color-surface-hover));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.sub-agent-list__item--active {
  background: var(--workspace-list-active-bg, var(--color-surface-active));
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-weight: var(--font-weight-medium);
}

.sub-agent-list__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
  flex-shrink: 0;
}

.sub-agent-list__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.sub-agent-list__empty {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-align: center;
  padding: var(--spacing-4) 0;
}

/* ---------- 右侧编辑区 ---------- */
.sub-agent-editor__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-3);
}

.sub-agent-editor__header h3 {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.sub-agent-editor__actions {
  display: flex;
  gap: var(--spacing-2);
  align-items: center;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  flex: 1;
  min-height: 0;
}

.editor-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.editor-form__field--grow {
  flex: 1;
  min-height: 0;
}

.editor-form__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.text-input,
.prompt-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  padding: var(--spacing-2) var(--spacing-3);
  font: inherit;
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.text-input:focus,
.prompt-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.prompt-input {
  flex: 1;
  min-height: 240px;
  resize: none;
  font-family: var(--font-family-mono);
  line-height: 1.6;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-3);
  flex-shrink: 0;
}

@media (max-width: 1280px) {
  .sub-agent-page__body {
    grid-template-columns: 180px minmax(0, 1fr);
  }
}
</style>
