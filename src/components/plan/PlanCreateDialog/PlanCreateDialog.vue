<script setup lang="ts">
import type { PlanCreateFormState } from '../planListShared'
import {
  usePlanCreateDialog,
  type PlanCreateDialogEmits,
  type PlanCreateDialogProps
} from './usePlanCreateDialog'

const props = defineProps<PlanCreateDialogProps>()
const emit = defineEmits<PlanCreateDialogEmits>()

const {
  updateField,
  minDateTime,
  isAiMode,
  EaModal,
  EaButton,
  EaIcon,
  MemoryLibraryPicker
} = usePlanCreateDialog(props, emit)
</script>

<template>
  <EaModal
    :visible="props.visible"
    content-class="plan-create-dialog"
    @update:visible="(value) => { if (!value) emit('close') }"
  >
    <template #header>
      <div class="dialog-title">
        <EaIcon
          name="plus"
          :size="16"
        />
        <span>新建计划</span>
      </div>
      <button
        class="btn-close"
        title="关闭"
        @click="emit('close')"
      >
        <EaIcon
          name="x"
          :size="16"
        />
      </button>
    </template>

    <div class="dialog-body">
      <div class="form-field">
        <label>计划名称 <span class="required">*</span></label>
        <input
          :value="props.form.name"
          type="text"
          placeholder="请输入计划名称"
          autofocus
          @input="updateField('name', ($event.target as HTMLInputElement).value)"
        >
      </div>
      <div class="form-field">
        <label>计划描述</label>
        <textarea
          :value="props.form.description"
          placeholder="描述计划的目标和范围（可选）"
          rows="3"
          @input="updateField('description', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- 拆分模式 -->
      <div class="form-field">
        <label>任务拆分模式</label>
        <div class="mode-options">
          <label
            class="mode-option"
            :class="{ active: props.form.splitMode === 'ai' }"
          >
            <input
              type="radio"
              :checked="props.form.splitMode === 'ai'"
              @change="updateField('splitMode', 'ai')"
            >
            <span class="mode-icon">AI</span>
            <div class="mode-content">
              <span class="mode-label">AI 协同</span>
              <span class="mode-desc">AI 帮助拆分任务</span>
            </div>
          </label>
          <label
            class="mode-option"
            :class="{ active: props.form.splitMode === 'manual' }"
          >
            <input
              type="radio"
              :checked="props.form.splitMode === 'manual'"
              @change="updateField('splitMode', 'manual')"
            >
            <span class="mode-icon">手</span>
            <div class="mode-content">
              <span class="mode-label">手动模式</span>
              <span class="mode-desc">自己创建任务</span>
            </div>
          </label>
        </div>
      </div>

      <!-- AI 模式相关字段 -->
      <template v-if="isAiMode()">
        <div class="form-row">
          <div class="form-field">
            <label>拆分专家 <span class="required">*</span></label>
            <EaSelect
              :model-value="props.form.splitAgentId ?? ''"
              :options="props.agentOptions"
              placeholder="请选择专家"
              @update:model-value="updateField('splitAgentId', ($event as string) || null)"
            />
          </div>
          <div class="form-field">
            <label>拆分模型 <span class="required">*</span></label>
            <EaSelect
              :model-value="props.form.splitModelId"
              :options="props.modelOptions"
              placeholder="请选择模型"
              :disabled="props.modelOptions.length === 0"
              @update:model-value="updateField('splitModelId', $event as string)"
            />
            <span
              v-if="props.modelOptions.length === 0"
              class="field-hint"
            >当前专家绑定的运行时暂无可用模型，请先在 AgentTeams 或 Agent 设置中配置模型</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>拆分颗粒度</label>
            <input
              :value="props.form.granularity"
              type="number"
              min="5"
              max="50"
              placeholder="建议 5-50"
              @input="updateField('granularity', Number(($event.target as HTMLInputElement).value))"
            >
            <span class="field-hint">建议拆分出的任务数量，数值越大拆分越细</span>
          </div>
          <div class="form-field">
            <label>最大重试次数</label>
            <input
              :value="props.form.maxRetryCount"
              type="number"
              min="1"
              max="5"
              placeholder="建议 1-3"
              @input="updateField('maxRetryCount', Number(($event.target as HTMLInputElement).value))"
            >
            <span class="field-hint">单个任务执行失败后的最大重试次数</span>
          </div>
        </div>
        <div class="hint-box">
          <EaIcon
            name="info"
            :size="16"
          />
          <span>配置完成后将由 AI 自动拆分任务，并根据 AgentTeams 专家团队自动为每个任务分配合适专家</span>
        </div>
      </template>

      <template v-if="!isAiMode()">
        <div class="hint-box hint-box-manual">
          <EaIcon
            name="info"
            :size="16"
          />
          <span>手动模式：创建计划后，您可以在任务看板中手动添加任务</span>
        </div>
      </template>

      <div class="form-field schedule-field">
        <label>执行方式</label>
        <EaSelect
          :model-value="props.form.executionMode"
          :options="[
            { value: 'immediate', label: '立即执行' },
            { value: 'scheduled', label: '定时执行' }
          ]"
          @update:model-value="updateField('executionMode', $event as PlanCreateFormState['executionMode'])"
        />
        <div
          v-if="props.form.executionMode === 'scheduled'"
          class="schedule-datetime"
        >
          <input
            :value="props.form.scheduledDateTime"
            type="datetime-local"
            :min="minDateTime"
            @input="updateField('scheduledDateTime', ($event.target as HTMLInputElement).value)"
          >
          <span
            v-if="props.form.scheduledDateTime"
            class="schedule-preview"
          >
            计划将于 {{ new Date(props.form.scheduledDateTime).toLocaleString('zh-CN') }} 执行
          </span>
        </div>
      </div>

      <div class="form-field form-field--memory">
        <MemoryLibraryPicker
          :model-value="props.form.memoryLibraryIds"
          hint="计划挂载的记忆库会默认透传给每个任务。"
          @update:model-value="updateField('memoryLibraryIds', $event)"
        />
      </div>
    </div>

    <template #footer>
      <EaButton
        type="secondary"
        @click="emit('close')"
      >
        取消
      </EaButton>
      <template v-if="!isAiMode()">
        <EaButton
          type="primary"
          :disabled="!props.canSaveDraft"
          @click="emit('createManual')"
        >
          创建计划
        </EaButton>
      </template>
      <!-- AI 模式按钮 -->
      <template v-else>
        <EaButton
          type="secondary"
          :disabled="!props.canSaveDraft"
          @click="emit('saveDraft')"
        >
          保存（草稿）
        </EaButton>
        <EaButton
          type="primary"
          :disabled="!props.canStartSplit"
          @click="emit('startSplit')"
        >
          确认并开始拆分
        </EaButton>
      </template>
    </template>
  </EaModal>
</template>

<style scoped src="./styles.css"></style>
