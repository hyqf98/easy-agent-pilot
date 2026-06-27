<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EaButton, EaModal } from '@/components/common'
import EaSelect from '@/components/common/EaSelect/EaSelect.vue'
import type { SelectOption } from '@/components/common/EaSelect/useEaSelect'
import { useAgentStore } from '@/stores/agent'
import type { MemoryLibrary } from '@/types/memory'

const props = defineProps<{
  visible: boolean
  libraries: MemoryLibrary[]
  selectedCount: number
  currentLibraryId?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [payload: { libraryId: string; agentId?: string }]
}>()

const agentStore = useAgentStore()
const selectedLibraryId = ref('')
const selectedAgentId = ref('')

const libraryOptions = computed<SelectOption[]>(() =>
  props.libraries.map((library) => ({
    value: library.id,
    label: library.name
  }))
)

const agentOptions = computed<SelectOption[]>(() =>
  agentStore.agents.map((agent) => ({
    value: agent.id,
    label: agent.name
  }))
)

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    selectedLibraryId.value = props.currentLibraryId ?? props.libraries[0]?.id ?? ''
    if (agentStore.agents.length === 0) {
      await agentStore.loadAgents()
    }
    selectedAgentId.value = agentStore.currentAgentId ?? agentStore.agents[0]?.id ?? ''
  }
)

function handleConfirm() {
  if (!selectedLibraryId.value) return
  emit('confirm', {
    libraryId: selectedLibraryId.value,
    agentId: selectedAgentId.value || undefined
  })
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="memory-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <h3 class="memory-dialog__title">
        AI 压缩到记忆库
      </h3>
    </template>

    <div class="memory-dialog__body">
      <p class="memory-merge-note">
        将把目标记忆库当前 Markdown 内容与选中的 {{ selectedCount }} 条原始记忆一起交给 AI，返回新的完整 Markdown 文档并覆盖保存。
      </p>

      <label class="memory-dialog__field">
        <span>目标记忆库</span>
        <EaSelect
          v-model="selectedLibraryId"
          :options="libraryOptions"
          :disabled="libraryOptions.length === 0"
          placeholder="请选择记忆库"
        />
      </label>

      <label class="memory-dialog__field">
        <span>压缩智能体</span>
        <EaSelect
          v-model="selectedAgentId"
          :options="agentOptions"
          :disabled="agentOptions.length === 0"
          placeholder="请选择智能体"
        />
      </label>
    </div>

    <template #footer>
      <EaButton
        type="secondary"
        @click="emit('update:visible', false)"
      >
        取消
      </EaButton>
      <EaButton
        :loading="loading"
        :disabled="!selectedLibraryId || !selectedAgentId || selectedCount === 0"
        @click="handleConfirm"
      >
        开始压缩
      </EaButton>
    </template>
  </EaModal>
</template>
<style scoped src="./MemoryMergeModal.css"></style>
