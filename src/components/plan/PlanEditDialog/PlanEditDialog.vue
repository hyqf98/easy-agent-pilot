<script setup lang="ts">
import type { PlanEditFormState } from '../planListShared'
import {
  usePlanEditDialog,
  type PlanEditDialogEmits,
  type PlanEditDialogProps
} from './usePlanEditDialog'

const props = defineProps<PlanEditDialogProps>()
const emit = defineEmits<PlanEditDialogEmits>()

const {
  updateField,
  canEditSchedule,
  minDateTime,
  isDraftEditable,
  EaModal,
  EaButton,
  EaIcon,
  MemoryLibraryPicker
} = usePlanEditDialog(props, emit)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="plan-edit-dialog"
    @update:visible="(value) => { if (!value) emit('close') }"
  >
    <template #header>
      <div class="dialog-title">
        <EaIcon
          name="pencil"
          :size="16"
        />
        <span>编辑计划</span>
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

      <template v-if="isDraftEditable(props.plan?.status)">
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

        <template v-if="props.form.splitMode === 'ai'">
          <div class="form-row">
            <div class="form-field">
              <label>拆分专家</label>
              <select
                :value="props.form.splitAgentId ?? ''"
                class="form-select"
                @change="updateField('splitAgentId', (($event.target as HTMLSelectElement).value || null))"
              >
                <option value="">
                  请选择专家
                </option>
                <option
                  v-for="option in props.agentOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div class="form-field">
              <label>拆分模型</label>
              <select
                :value="props.form.splitModelId"
                class="form-select"
                :disabled="props.modelOptions.length === 0"
                @change="updateField('splitModelId', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  请选择模型
                </option>
                <option
                  v-for="option in props.modelOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
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
        </template>

        <div
          v-else
          class="hint-box hint-box-manual"
        >
          <EaIcon
            name="info"
            :size="16"
          />
          <span>手动模式下，保存后可在任务看板中继续手动维护任务</span>
        </div>
      </template>

      <div
        v-if="canEditSchedule(props.plan?.status)"
        class="form-field schedule-field"
      >
        <label>执行方式</label>
        <select
          :value="props.form.executionMode"
          class="form-select"
          @change="updateField('executionMode', ($event.target as HTMLSelectElement).value as PlanEditFormState['executionMode'])"
        >
          <option value="immediate">
            立即执行
          </option>
          <option value="scheduled">
            定时执行
          </option>
        </select>
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
          hint="计划挂载的记忆库会作为任务默认上下文。"
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
      <EaButton
        type="primary"
        :disabled="!props.form.name.trim()"
        @click="emit('save')"
      >
        保存
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped src="./styles.css"></style>
