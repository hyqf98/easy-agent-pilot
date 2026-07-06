<script setup lang="ts">
import { useClaudeConfigScanModal, type ClaudeConfigScanModalEmits } from './useClaudeConfigScanModal'

const emit = defineEmits<ClaudeConfigScanModalEmits>()

const {
  EaButton,
  EaIcon,
  ClaudeScanMcpList,
  ClaudeScanPluginsList,
  ClaudeScanSkillsList,
  ClaudeScanTabs,
  t,
  isScanning,
  scanResult,
  scanError,
  selectedMcpServers,
  selectedSkills,
  selectedPlugins,
  activeTab,
  selectedCount,
  canImport,
  tabCounts,
  scanConfig,
  toggleAllMcp,
  toggleAllSkills,
  toggleAllPlugins,
  handleImport,
  handleClose,
  toggleMcpServer,
  toggleSkill,
  togglePlugin
} = useClaudeConfigScanModal(emit)
</script>

<template>
  <div class="scan-modal">
    <div class="scan-modal__header">
      <h3 class="scan-modal__title">
        {{ t('settings.agent.scan.title') }}
      </h3>
      <button
        class="scan-modal__close"
        @click="handleClose"
      >
        <EaIcon
          name="close"
          :size="18"
        />
      </button>
    </div>

    <div class="scan-modal__body">
      <!-- 扫描中状态 -->
      <div
        v-if="isScanning"
        class="scan-modal__loading"
      >
        <EaIcon
          name="loader"
          :size="24"
          spin
        />
        <span>{{ t('settings.agent.scan.scanning') }}</span>
      </div>

      <!-- 扫描错误 -->
      <div
        v-else-if="scanError"
        class="scan-modal__error"
      >
        <EaIcon
          name="alert-circle"
          :size="24"
        />
        <span>{{ scanError }}</span>
        <EaButton
          type="secondary"
          @click="scanConfig"
        >
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <!-- 扫描结果 -->
      <template v-else-if="scanResult">
        <!-- 扫描目录信息 -->
        <div class="scan-modal__info">
          <EaIcon
            name="folder"
            :size="16"
          />
          <span>{{ scanResult.claude_dir }}</span>
        </div>

        <ClaudeScanTabs
          v-model:active-tab="activeTab"
          :counts="tabCounts"
        />

        <ClaudeScanMcpList
          v-show="activeTab === 'mcp'"
          :items="scanResult.mcp_servers"
          :selected-names="selectedMcpServers"
          @toggle-all="toggleAllMcp"
          @toggle-item="toggleMcpServer"
        />

        <ClaudeScanSkillsList
          v-show="activeTab === 'skills'"
          :items="scanResult.skills"
          :selected-names="selectedSkills"
          @toggle-all="toggleAllSkills"
          @toggle-item="toggleSkill"
        />

        <ClaudeScanPluginsList
          v-show="activeTab === 'plugins'"
          :items="scanResult.plugins"
          :selected-names="selectedPlugins"
          @toggle-all="toggleAllPlugins"
          @toggle-item="togglePlugin"
        />
      </template>
    </div>

    <div class="scan-modal__footer">
      <span
        v-if="selectedCount > 0"
        class="scan-modal__selected-count"
      >
        {{ t('settings.agent.scan.selectedCount', { n: selectedCount }) }}
      </span>
      <span
        v-else
        class="scan-modal__selected-count scan-modal__selected-count--empty"
      >
        {{ t('settings.agent.scan.noSelection') }}
      </span>
      <div class="scan-modal__actions">
        <EaButton
          type="secondary"
          @click="handleClose"
        >
          {{ t('common.cancel') }}
        </EaButton>
        <EaButton
          type="primary"
          :disabled="!canImport"
          @click="handleImport"
        >
          {{ t('settings.agent.scan.importSelected') }}
        </EaButton>
      </div>
    </div>
  </div>
</template>
<style scoped src="./ClaudeConfigScanModal.css"></style>
