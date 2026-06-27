<script setup lang="ts">
import { reactive, watch } from 'vue'
import { EaButton, EaModal } from '@/components/common'
import type { RawMemoryRecord } from '@/types/memory'

const props = defineProps<{
  visible: boolean
  record?: RawMemoryRecord | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: { content: string }]
}>()

const form = reactive({
  content: ''
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.content = props.record?.content ?? ''
  }
)

function close() {
  emit('update:visible', false)
}

function handleSubmit() {
  const content = form.content.trim()
  if (!content) return
  emit('submit', { content })
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
        {{ record ? '编辑原始记忆' : '手动添加原始记忆' }}
      </h3>
    </template>

    <div class="memory-dialog__body">
      <label class="memory-dialog__field">
        <span>内容</span>
        <textarea
          v-model="form.content"
          class="memory-dialog__textarea"
          rows="10"
          placeholder="输入将被纳入原始记忆池的文本"
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
        :disabled="!form.content.trim()"
        @click="handleSubmit"
      >
        保存
      </EaButton>
    </template>
  </EaModal>
</template>
<style scoped src="./RawMemoryModal.css"></style>
