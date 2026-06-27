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
<style scoped src="./SubAgentConfigPage.css"></style>
