<script setup lang="ts">
import { useRepoEditModal } from '../useRepoModals'
import { EaButton, EaInput, EaModal, EaSelect } from '@/components/common'
import type { UpdateMemoryRepoInput } from '@/types/memoryRepo'

defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [input: UpdateMemoryRepoInput]
}>()

const { draft, agentOptions } = useRepoEditModal()

function close() {
  emit('update:visible', false)
}

function handleSubmit() {
  const name = draft.value.name.trim()
  if (!name) return
  emit('submit', {
    name,
    description: draft.value.description.trim() || undefined,
    systemPrompt: draft.value.systemPrompt,
    agentId: draft.value.agentId || undefined,
    modelId: draft.value.modelId.trim() || undefined,
    internalToolsEnabled: draft.value.internalToolsEnabled,
    enabled: draft.value.enabled
  })
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="repo-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <h3 class="repo-dialog__title">
        编辑记忆库仓库
      </h3>
    </template>

    <div class="repo-dialog__body">
      <label class="repo-dialog__field">
        <span>名称</span>
        <EaInput
          v-model="draft.name"
          placeholder="记忆库名称"
        />
      </label>

      <label class="repo-dialog__field">
        <span>说明</span>
        <textarea
          v-model="draft.description"
          class="repo-dialog__textarea"
          rows="3"
          placeholder="说明这个记忆库要沉淀什么长期信息"
        />
      </label>

      <label class="repo-dialog__field">
        <span>系统提示词</span>
        <textarea
          v-model="draft.systemPrompt"
          class="repo-dialog__textarea"
          rows="5"
          placeholder="运行归纳/任务时注入的系统提示词"
        />
      </label>

      <div class="repo-dialog__row">
        <label class="repo-dialog__field">
          <span>执行 Agent</span>
          <EaSelect
            v-model="draft.agentId"
            :options="agentOptions"
            placeholder="选择 ACP 客户端"
          />
        </label>
        <label class="repo-dialog__field">
          <span>模型 ID（可选）</span>
          <EaInput
            v-model="draft.modelId"
            placeholder="覆盖默认模型"
          />
        </label>
      </div>

      <label class="repo-dialog__check">
        <input
          v-model="draft.internalToolsEnabled"
          type="checkbox"
        >
        <span>向运行注入内置工具（查询本机对话历史）</span>
      </label>

      <label class="repo-dialog__check">
        <input
          v-model="draft.enabled"
          type="checkbox"
        >
        <span>启用此仓库</span>
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
        :disabled="!draft.name.trim()"
        @click="handleSubmit"
      >
        保存
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped src="./styles.css"></style>
