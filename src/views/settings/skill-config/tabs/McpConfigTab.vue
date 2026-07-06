<script setup lang="ts">
import { useMcpConfigTab, type McpConfigTabProps, type McpConfigTabEmits } from './useMcpConfigTab'

const props = defineProps<McpConfigTabProps>()
const emit = defineEmits<McpConfigTabEmits>()

const {
  McpConfigListView,
  McpConfigEditView,
  McpConfigTestView,
  testingConfig,
  editingConfig,
  isTesting,
  isEditing,
  showList,
  handleAdd,
  goBackToList,
  handleSave,
} = useMcpConfigTab(props, emit)
</script>

<template>
  <div class="mcp-config-tab">
    <McpConfigListView
      v-if="showList"
      :configs="props.configs"
      :is-read-only="isReadOnly"
      :is-loading="isLoading"
      :can-sync="canSync"
      :can-refresh="canRefresh"
      :can-open-file="canOpenFile"
      @add="handleAdd"
      @refresh="emit('refresh')"
      @sync="emit('sync')"
      @open-file="emit('open-file')"
      @test="testingConfig = $event"
      @edit="editingConfig = $event"
      @delete="emit('delete', $event)"
    />

    <McpConfigEditView
      v-else-if="isEditing && editingConfig"
      :config="editingConfig"
      @back="goBackToList"
      @save="handleSave"
    />

    <McpConfigTestView
      v-else-if="isTesting && testingConfig"
      :config="testingConfig"
      @back="goBackToList"
    />
  </div>
</template>
<style scoped src="./McpConfigTab.css"></style>
