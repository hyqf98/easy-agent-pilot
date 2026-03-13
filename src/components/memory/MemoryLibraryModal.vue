<script setup lang="ts">
import { reactive, watch } from 'vue'
import { EaButton, EaInput, EaModal } from '@/components/common'
import type { MemoryLibrary } from '@/types/memory'

const props = defineProps<{
  visible: boolean
  library?: MemoryLibrary | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: { name: string; description?: string }]
}>()

const form = reactive({
  name: '',
  description: ''
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.name = props.library?.name ?? ''
    form.description = props.library?.description ?? ''
  }
)

function close() {
  emit('update:visible', false)
}

function handleSubmit() {
  const name = form.name.trim()
  if (!name) return

  emit('submit', {
    name,
    description: form.description.trim() || undefined
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
        {{ library ? '编辑记忆库' : '新建记忆库' }}
      </h3>
    </template>

    <div class="memory-dialog__body">
      <label class="memory-dialog__field">
        <span>名称</span>
        <EaInput
          v-model="form.name"
          placeholder="例如：开发协作记忆库"
        />
      </label>

      <label class="memory-dialog__field">
        <span>说明</span>
        <textarea
          v-model="form.description"
          class="memory-dialog__textarea"
          rows="5"
          placeholder="说明这个记忆库要沉淀什么长期信息"
        />
      </label>
    </div>

    <template #footer>
      <EaButton
        type="secondary"
        @click="close"
      >
        取消
      </EaButton>
      <EaButton
        :loading="loading"
        :disabled="!form.name.trim()"
        @click="handleSubmit"
      >
        保存
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

.memory-dialog__textarea {
  width: 100%;
  resize: vertical;
  min-height: 120px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font: inherit;
  outline: none;
}

.memory-dialog__textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-alpha-20);
}
</style>
