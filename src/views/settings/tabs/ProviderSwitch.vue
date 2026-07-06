<script setup lang="ts">
import { useProviderSwitch } from './useProviderSwitch'

const {
  ProviderConnectionInfoCard,
  ProviderConfigEditorModal,
  ProviderProfilesSection,
  ProviderSwitchTabs,
  ProviderProfileForm,
  store,
  currentCliType,
  currentConnection,
  showApiKey,
  currentProfiles,
  currentActiveProfile,
  currentDefaultProfile,
  switchingId,
  showFormModal,
  editingProfile,
  showConfigEditor,
  configEditorContent,
  configEditorFile,
  configEditorLocateTarget,
  isConfigEditorDirty,
  isConfigEditorLoading,
  isConfigEditorSaving,
  handleCliTypeChange,
  handleAdd,
  handleEdit,
  handleSwitch,
  handleDeleteConfirm,
  handleSave,
  handleOpenConfigEditor,
  handleReloadConfigEditor,
  handleFormatConfigEditor,
  handleSaveConfigEditor
} = useProviderSwitch()
</script>

<template>
  <div class="provider-switch">
    <ProviderSwitchTabs
      :current-cli-type="currentCliType"
      @change="handleCliTypeChange"
    />

    <ProviderConnectionInfoCard
      :loading="store.isLoadingConnections"
      :connection="currentConnection"
      :show-api-key="showApiKey"
      @toggle-api-key="showApiKey = !showApiKey"
      @open-config-editor="handleOpenConfigEditor"
    />

    <ProviderProfilesSection
      :loading="store.isLoading"
      :profiles="currentProfiles"
      :active-profile="currentActiveProfile"
      :default-profile="currentActiveProfile ? null : currentDefaultProfile"
      :switching-id="switchingId"
      @add="handleAdd"
      @edit="handleEdit"
      @switch="handleSwitch"
      @delete="handleDeleteConfirm"
    />

    <ProviderProfileForm
      v-model:visible="showFormModal"
      :profile="editingProfile"
      :cli-type="currentCliType"
      @save="handleSave"
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
<style scoped src="./ProviderSwitch.css"></style>
