<script setup lang="ts">
/** AgentPlanPane 组件：智能体计划展示窗格，渲染计划 Markdown 并提供确认/修改/执行（逻辑见 useAgentPlanPane.ts） */
import { EaIcon } from '@/components/common'
import MarkdownRenderer from '@/components/message/MarkdownRenderer/MarkdownRenderer.vue'
import { useAgentPlanPane, type AgentPlanPaneEmits, type AgentPlanPaneProps } from './useAgentPlanPane'

const props = defineProps<AgentPlanPaneProps>()
const emit = defineEmits<AgentPlanPaneEmits>()

const {
  t,
  planMarkdown,
  isEmpty,
  handleClose,
  handleMinimize
} = useAgentPlanPane(props)
</script>

<template>
  <section class="agent-plan-pane">
    <header class="agent-plan-pane__header">
      <div class="agent-plan-pane__title-wrap">
        <h3 class="agent-plan-pane__title">
          {{ t('message.agentPlan.title') }}
        </h3>
      </div>
      <div class="agent-plan-pane__window-actions">
        <button
          class="agent-plan-pane__window-action"
          :title="t('message.agentPlan.minimize')"
          @click="handleMinimize(); emit('minimize')"
        >
          <EaIcon
            name="minus"
            :size="15"
          />
        </button>
        <button
          class="agent-plan-pane__window-action"
          :title="t('message.agentPlan.close')"
          @click="handleClose"
        >
          <EaIcon
            name="x"
            :size="16"
          />
        </button>
      </div>
    </header>

    <div class="agent-plan-pane__body">
      <div
        v-if="isEmpty"
        class="agent-plan-pane__empty"
      >
        <span>{{ t('message.agentPlan.empty') }}</span>
      </div>
      <MarkdownRenderer
        v-else
        class="agent-plan-pane__doc"
        :content="planMarkdown"
      />
    </div>
  </section>
</template>

<style scoped src="./styles.css"></style>
