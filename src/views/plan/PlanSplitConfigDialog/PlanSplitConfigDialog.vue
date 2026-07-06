<script setup lang="ts">
/** PlanSplitConfigDialog 组件：计划拆分配置选择对话框（逻辑见 usePlanSplitConfigDialog.ts） */
import {
  usePlanSplitConfigDialog,
  type PlanSplitConfigDialogEmits,
  type PlanSplitConfigDialogProps
} from './usePlanSplitConfigDialog'

const props = defineProps<PlanSplitConfigDialogProps>()
const emit = defineEmits<PlanSplitConfigDialogEmits>()

const {
  updateField,
  EaModal,
  EaButton,
  EaIcon
} = usePlanSplitConfigDialog(props, emit)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="plan-split-config-dialog"
    @update:visible="(value) => { if (!value) emit('close') }"
  >
    <template #header>
      <div class="dialog-title">
        <EaIcon
          name="bot"
          :size="16"
        />
        <span>选择拆分配置</span>
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
      <p class="split-config-desc">
        计划「{{ props.plan?.name }}」尚未配置拆分专家和模型，请先选择后继续。
      </p>
      <div class="form-field">
        <label>拆分专家 <span class="required">*</span></label>
        <select
          :value="props.form.agentId ?? ''"
          class="form-select"
          @change="updateField('agentId', (($event.target as HTMLSelectElement).value || null))"
        >
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
        <label>拆分模型 <span class="required">*</span></label>
        <select
          :value="props.form.modelId"
          class="form-select"
          :disabled="props.modelOptions.length === 0"
          @change="updateField('modelId', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="option in props.modelOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
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
        :disabled="!props.canStart"
        @click="emit('start')"
      >
        开始拆分
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped src="./styles.css"></style>
