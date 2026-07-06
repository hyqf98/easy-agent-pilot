<script setup lang="ts">
/**
 * RepoCreateModal — 新建记忆库仓库弹窗骨架。
 * 仅负责模板渲染与 composable 胶水装配，全部逻辑见 useRepoCreateModal.ts。
 */
import {
  useRepoCreateModal,
  type RepoCreateModalProps,
  type RepoCreateModalEmits
} from './useRepoCreateModal'

const props = defineProps<RepoCreateModalProps>()
const emit = defineEmits<RepoCreateModalEmits>()

const { EaButton, EaInput, EaModal, EaSelect, draft, agentOptions, formatOptions, close, handleSubmit } =
  useRepoCreateModal(props, emit)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="repo-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <h3 class="repo-dialog__title">
        新建记忆库仓库
      </h3>
    </template>

    <div class="repo-dialog__body">
      <label class="repo-dialog__field">
        <span>名称</span>
        <EaInput
          v-model="draft.name"
          placeholder="例如：开发协作记忆库"
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
        <span>格式</span>
        <EaSelect
          v-model="draft.format"
          :options="formatOptions"
        />
      </label>

      <label class="repo-dialog__field">
        <span>系统提示词</span>
        <textarea
          v-model="draft.systemPrompt"
          class="repo-dialog__textarea"
          rows="5"
          placeholder="运行归纳/任务时注入的系统提示词，指导 AI 如何维护本仓库"
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
        创建
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped src="./styles.css"></style>
