<script setup lang="ts">
/**
 * SkillConfigPage — 技能配置页骨架。
 * 仅做模板渲染与 composable 胶水连接，全部业务逻辑见 useSkillConfigPage.ts。
 */
import { useSkillConfigPage } from './useSkillConfigPage'

const {
  CliConfigSyncModal,
  EaIcon,
  McpConfigTab,
  PluginDetailView,
  PluginEditModal,
  PluginsConfigTab,
  ProviderConfigEditorModal,
  SkillCreateView,
  SkillDetailView,
  SkillEditModal,
  SkillsConfigTab,
  agentStore,
  skillConfigStore,
  t,
  cliAgentTabs,
  hasCliAgents,
  activeCliType,
  currentConfigDir,
  handleCliTypeChange,
  canOpenCliConfigEditor,
  canSyncCliConfigs,
  contentRef,
  showSyncModal,
  syncType,
  showSkillModal,
  showPluginModal,
  showSkillBuilder,
  isCreatingSkill,
  editingSkill,
  editingPlugin,
  activeTab,
  showPluginsTab,
  showConfigEditor,
  configEditorContent,
  configEditorFile,
  configEditorLocateTarget,
  isConfigEditorDirty,
  isConfigEditorLoading,
  isConfigEditorSaving,
  handleSaveMcp,
  handleDeleteMcp,
  handleAddSkill,
  handleViewSkillDetail,
  handleEditSkill,
  handleDeleteSkill,
  handleBackFromSkill,
  handleDeleteSkillFromDetail,
  handleSaveSkill,
  handleBackFromSkillBuilder,
  handleCreateVisualSkill,
  handleAddPlugin,
  handleViewPluginDetail,
  handleEditPlugin,
  handleSavePlugin,
  handleDeletePlugin,
  handleBackFromPlugin,
  handleDeletePluginFromDetail,
  handleRefresh,
  handleOpenFile,
  handleReloadConfigEditor,
  handleFormatConfigEditor,
  handleSaveConfigEditor,
  handleSyncCompleted,
  openSyncModal
} = useSkillConfigPage()
</script>

<template>
  <div class="skill-config-page">
    <!-- CLI 类型 Tab（下划线风格，与子代理页保持一致） -->
    <section
      v-if="hasCliAgents"
      class="cli-type-tabs"
    >
      <div class="tabs-wrapper">
        <button
          v-for="option in cliAgentTabs"
          :key="option.provider"
          :class="['tab-btn', { active: activeCliType === option.provider }]"
          @click="handleCliTypeChange(option.provider)"
        >
          <EaIcon
            name="terminal"
            :size="14"
          />
          <span>{{ option.label }}</span>
        </button>
      </div>
      <p class="cli-type-tabs__hint">
        {{ t('settings.agentConfig.cliConfigDirHint', { dir: currentConfigDir }) }}
      </p>
    </section>
    <div
      v-else
      class="skill-config-page__empty"
    >
      <EaIcon
        name="lucide:inbox"
        class="skill-config-page__empty-icon"
      />
      <span>{{ t('settings.agentConfig.noAgents') }}</span>
    </div>

    <!-- Skill 创建视图（全屏，命中时替换整个面板） -->
    <SkillCreateView
      v-if="showSkillBuilder && activeTab === 'skills'"
      :agent="skillConfigStore.selectedAgent"
      :cli-config-paths="skillConfigStore.cliConfigPaths"
      :is-saving="isCreatingSkill"
      @back="handleBackFromSkillBuilder"
      @save="handleCreateVisualSkill"
    />

    <!-- Plugin 详情视图 -->
    <PluginDetailView
      v-else-if="skillConfigStore.selectedPlugin && activeTab === 'plugins' && showPluginsTab"
      :plugin="skillConfigStore.selectedPlugin"
      @back="handleBackFromPlugin"
      @delete="handleDeletePluginFromDetail"
    />

    <template v-else>
      <div class="skill-config-page__tabs">
        <button
          class="skill-config-page__tab"
          :class="{ 'skill-config-page__tab--active': activeTab === 'mcp' }"
          @click="activeTab = 'mcp'"
        >
          <EaIcon name="lucide:server" />
          {{ t('settings.integration.tabs.mcp') }}
        </button>
        <button
          class="skill-config-page__tab"
          :class="{ 'skill-config-page__tab--active': activeTab === 'skills' }"
          @click="activeTab = 'skills'"
        >
          <EaIcon name="lucide:book-open" />
          {{ t('settings.integration.tabs.skills') }}
        </button>
        <button
          v-if="showPluginsTab"
          class="skill-config-page__tab"
          :class="{ 'skill-config-page__tab--active': activeTab === 'plugins' }"
          @click="activeTab = 'plugins'"
        >
          <EaIcon name="lucide:puzzle" />
          {{ t('settings.integration.tabs.plugins') }}
        </button>
      </div>

      <div
        ref="contentRef"
        class="skill-config-page__content"
      >
        <McpConfigTab
          v-if="activeTab === 'mcp'"
          :configs="skillConfigStore.mcpConfigs"
          :is-read-only="skillConfigStore.isReadOnly"
          :is-loading="skillConfigStore.isLoading"
          :can-sync="canSyncCliConfigs"
          :can-refresh="canOpenCliConfigEditor"
          :can-open-file="canOpenCliConfigEditor"
          @refresh="handleRefresh"
          @sync="openSyncModal('mcp')"
          @open-file="handleOpenFile"
          @save="handleSaveMcp"
          @delete="handleDeleteMcp"
        />
        <!-- skills tab：选中技能时左右分屏（列表常驻 + 详情撑满），否则单列列表 -->
        <div
          v-if="activeTab === 'skills'"
          class="skill-config-page__skills-panel"
          :class="{ 'skill-config-page__skills-panel--split': !!skillConfigStore.selectedSkill }"
        >
          <SkillsConfigTab
            class="skill-config-page__skills-list"
            :configs="skillConfigStore.skillsConfigs"
            :is-read-only="skillConfigStore.isReadOnly"
            :is-loading="skillConfigStore.isLoading"
            :can-sync="canSyncCliConfigs"
            @add="handleAddSkill"
            @sync="openSyncModal('skills')"
            @detail="handleViewSkillDetail"
            @edit="handleEditSkill"
            @delete="handleDeleteSkill"
          />
          <SkillDetailView
            v-if="skillConfigStore.selectedSkill"
            class="skill-config-page__skills-detail"
            :skill="skillConfigStore.selectedSkill"
            @back="handleBackFromSkill"
            @delete="handleDeleteSkillFromDetail"
          />
        </div>
        <PluginsConfigTab
          v-else-if="activeTab === 'plugins' && showPluginsTab"
          :configs="skillConfigStore.pluginsConfigs"
          :is-read-only="skillConfigStore.isReadOnly"
          :is-loading="skillConfigStore.isLoading"
          :can-refresh="canOpenCliConfigEditor"
          :can-open-file="canOpenCliConfigEditor"
          @add="handleAddPlugin"
          @refresh="handleRefresh"
          @open-file="handleOpenFile"
          @detail="handleViewPluginDetail"
          @edit="handleEditPlugin"
          @delete="handleDeletePlugin"
        />
      </div>
    </template>

    <CliConfigSyncModal
      :visible="showSyncModal"
      :sync-type="syncType"
      :agents="agentStore.agents"
      :selected-agent="skillConfigStore.selectedAgent"
      @close="showSyncModal = false"
      @completed="handleSyncCompleted"
    />

    <SkillEditModal
      v-model:visible="showSkillModal"
      :config="editingSkill"
      @save="handleSaveSkill"
    />

    <PluginEditModal
      v-model:visible="showPluginModal"
      :config="editingPlugin"
      @save="handleSavePlugin"
    />

    <ProviderConfigEditorModal
      v-model:visible="showConfigEditor"
      :loading="isConfigEditorLoading"
      :saving="isConfigEditorSaving"
      :file="configEditorFile"
      :content="configEditorContent"
      :dirty="isConfigEditorDirty"
      :locate-target="configEditorLocateTarget"
      @update:content="configEditorContent = $event"
      @reload="handleReloadConfigEditor"
      @format="handleFormatConfigEditor"
      @save="handleSaveConfigEditor"
    />
  </div>
</template>
<style scoped src="./SkillConfigPage.css"></style>
