<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EaButton, EaModal } from '@/components/common'
import EaSelect, { type SelectOption } from '@/components/common/EaSelect.vue'
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

<style scoped>
.memory-dialog__title {
  margin: 0;
  font-size: 22px;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
}

.memory-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.memory-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.memory-dialog__field span {
  color: var(--color-text-primary);
  font-weight: 600;
}

.memory-merge-note {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(15, 23, 42, 0.04));
  color: var(--color-text-secondary);
  line-height: 1.7;
}
</style>
