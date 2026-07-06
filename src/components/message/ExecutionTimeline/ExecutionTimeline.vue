<script setup lang="ts">
/** ExecutionTimeline 组件：执行时间线，按区块渲染思考/工具调用/表单/通知等执行过程（逻辑见 useExecutionTimeline.ts） */
import DynamicForm from '@/views/plan/dynamicForm/DynamicForm.vue'
import StructuredContentRenderer from '../StructuredContentRenderer/StructuredContentRenderer.vue'
import ThinkingDisplay from '../ThinkingDisplay/ThinkingDisplay.vue'
import ToolCallDisplay from '../ToolCallDisplay/ToolCallDisplay.vue'
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer.vue'
import RuntimeNoticeList from '../RuntimeNoticeList/RuntimeNoticeList.vue'
import {
  useExecutionTimeline,
  type ExecutionTimelineEmits,
  type ExecutionTimelineProps
} from './useExecutionTimeline'

const props = withDefaults(defineProps<ExecutionTimelineProps>(), {
  groupToolCalls: false,
  showElapsedMeta: false,
  formCancelText: '取消',
  compactContextNotices: false
})
const emit = defineEmits<ExecutionTimelineEmits>()

const {
  t,
  isDarkTheme,
  renderBlocks,
  resolveToolGroupModelLabel,
  shouldClampToolGroup,
  getToolGroupKey,
  isToolGroupExpanded,
  toggleToolGroup,
  getToolCallRenderKey,
  toRuntimeNotices,
  getEntryElapsedLabel,
  buildSubmittedFormSummary,
  handleMessageFormSubmit,
  handleMessageFormCancel
} = useExecutionTimeline(props, emit)
</script>

<template>
  <div
    class="execution-timeline"
    :class="{ 'execution-timeline--dark': isDarkTheme }"
  >
    <template
      v-for="block in renderBlocks"
      :key="block.key"
    >
      <div
        v-if="block.kind === 'tool-group'"
        class="execution-timeline__tool-calls-wrap"
      >
        <div
          v-if="resolveToolGroupModelLabel(block.entries)"
          class="execution-timeline__tool-model-bubble"
        >
          <span class="execution-timeline__tool-model-label">{{ t('message.runtimeNotice.model') }}</span>
          <span class="execution-timeline__tool-model-value">{{ resolveToolGroupModelLabel(block.entries) }}</span>
        </div>
        <div
          class="execution-timeline__tool-calls-shell"
          :class="{ 'execution-timeline__tool-calls-shell--scrollable': shouldClampToolGroup(block.entries) }"
        >
          <button
            type="button"
            class="execution-timeline__tool-calls-head"
            :aria-expanded="isToolGroupExpanded(block.key)"
            @click="toggleToolGroup(block.key)"
          >
            <span class="execution-timeline__tool-calls-title">工具调用</span>
            <span class="execution-timeline__tool-calls-head-right">
              <span class="execution-timeline__tool-calls-count">{{ block.entries.length }}</span>
              <span class="execution-timeline__tool-calls-toggle">
                {{ isToolGroupExpanded(block.key) ? t('message.collapse') : t('message.expand') }}
              </span>
            </span>
          </button>
          <div
            v-if="isToolGroupExpanded(block.key)"
            class="execution-timeline__tool-calls"
          >
            <ToolCallDisplay
              v-for="toolEntry in block.entries"
              :key="getToolCallRenderKey(toolEntry.toolCall!)"
              :tool-call="toolEntry.toolCall!"
              :live="toolEntry.animate"
              :compact="toolEntry.toolCompact"
              :default-expanded="toolEntry.toolDefaultExpanded ?? false"
              :default-result-expanded="toolEntry.toolDefaultResultExpanded ?? false"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="block.kind === 'assistant-turn'"
        class="execution-timeline__assistant-turn"
      >
        <div
          v-if="block.contentEntry && getEntryElapsedLabel(block.contentEntry)"
          class="timeline-entry__meta timeline-entry__meta--assistant-turn"
        >
          用时 {{ getEntryElapsedLabel(block.contentEntry) }}
        </div>

        <ThinkingDisplay
          v-if="block.thinkingEntry?.content"
          :key="block.thinkingEntry.id"
          :thinking="block.thinkingEntry.content || ''"
          :live="block.thinkingEntry.animate"
          :default-expanded="false"
        />

        <div
          v-if="block.toolEntries.length > 0"
          class="execution-timeline__tool-calls-wrap"
        >
          <div
            v-if="resolveToolGroupModelLabel(block.toolEntries, [block.contentEntry, block.thinkingEntry])"
            class="execution-timeline__tool-model-bubble"
          >
            <span class="execution-timeline__tool-model-label">{{ t('message.runtimeNotice.model') }}</span>
            <span class="execution-timeline__tool-model-value">{{ resolveToolGroupModelLabel(block.toolEntries, [block.contentEntry, block.thinkingEntry]) }}</span>
          </div>
          <div
            class="execution-timeline__tool-calls-shell"
            :class="{ 'execution-timeline__tool-calls-shell--scrollable': shouldClampToolGroup(block.toolEntries) }"
          >
            <button
              type="button"
              class="execution-timeline__tool-calls-head"
              :aria-expanded="isToolGroupExpanded(getToolGroupKey(block.toolEntries))"
              @click="toggleToolGroup(getToolGroupKey(block.toolEntries))"
            >
              <span class="execution-timeline__tool-calls-title">工具调用</span>
              <span class="execution-timeline__tool-calls-head-right">
                <span class="execution-timeline__tool-calls-count">{{ block.toolEntries.length }}</span>
                <span class="execution-timeline__tool-calls-toggle">
                  {{ isToolGroupExpanded(getToolGroupKey(block.toolEntries)) ? t('message.collapse') : t('message.expand') }}
                </span>
              </span>
            </button>
            <div
              v-if="isToolGroupExpanded(getToolGroupKey(block.toolEntries))"
              class="execution-timeline__tool-calls"
            >
              <ToolCallDisplay
                v-for="toolEntry in block.toolEntries"
                :key="getToolCallRenderKey(toolEntry.toolCall!)"
                :tool-call="toolEntry.toolCall!"
                :live="toolEntry.animate"
                :compact="toolEntry.toolCompact"
                :default-expanded="toolEntry.toolDefaultExpanded ?? false"
                :default-result-expanded="toolEntry.toolDefaultResultExpanded ?? false"
              />
            </div>
          </div>
        </div>

        <div
          v-if="block.contentEntry?.content"
          class="execution-timeline__assistant-content"
        >
          <StructuredContentRenderer
            :content="block.contentEntry.content"
            :interactive-forms="true"
            :animate="block.contentEntry.animate"
            @form-submit="handleMessageFormSubmit"
            @form-cancel="handleMessageFormCancel"
          />
        </div>
      </div>

      <template v-else>
        <div
          v-if="block.entry.type === 'message'"
          class="timeline-message"
          :class="`timeline-message--${block.entry.role || 'assistant'}`"
        >
          <div class="timeline-message__content">
            <div
              v-if="getEntryElapsedLabel(block.entry)"
              class="timeline-entry__meta"
            >
              用时 {{ getEntryElapsedLabel(block.entry) }}
            </div>
            <StructuredContentRenderer
              v-if="block.entry.role !== 'user'"
              :content="block.entry.content || ''"
              :interactive-forms="block.entry.role === 'assistant'"
              :animate="block.entry.animate"
              @form-submit="handleMessageFormSubmit"
              @form-cancel="handleMessageFormCancel"
            />
            <p
              v-else
              class="timeline-message__text"
            >
              {{ block.entry.content || '' }}
            </p>
          </div>
        </div>

        <ThinkingDisplay
          v-else-if="block.entry.type === 'thinking'"
          :thinking="block.entry.content || ''"
          :live="block.entry.animate"
          :default-expanded="false"
        />

        <ToolCallDisplay
          v-else-if="block.entry.type === 'tool' && block.entry.toolCall"
          :key="getToolCallRenderKey(block.entry.toolCall)"
          :tool-call="block.entry.toolCall"
          :live="block.entry.animate"
          :compact="block.entry.toolCompact"
          :default-expanded="block.entry.toolDefaultExpanded ?? false"
          :default-result-expanded="block.entry.toolDefaultResultExpanded ?? false"
        />

        <div
          v-else-if="block.entry.type === 'content' && block.entry.content"
          class="timeline-message timeline-message--assistant"
        >
          <div class="timeline-message__content">
            <div
              v-if="getEntryElapsedLabel(block.entry)"
              class="timeline-entry__meta"
            >
              用时 {{ getEntryElapsedLabel(block.entry) }}
            </div>
            <MarkdownRenderer
              :content="block.entry.content"
              :animate="block.entry.animate"
            />
          </div>
        </div>

        <div
          v-else-if="block.entry.type === 'form' && block.entry.formSchema"
          class="timeline-form"
          :class="[
            `timeline-form--${block.entry.formVariant || 'active'}`,
            { 'timeline-form--user': block.entry.role === 'user' }
          ]"
        >
          <div
            v-if="block.entry.role === 'user' && block.entry.formVariant === 'submitted'"
            class="timeline-form__content timeline-form__submitted-summary"
          >
            <div
              v-if="getEntryElapsedLabel(block.entry)"
              class="timeline-entry__meta"
            >
              用时 {{ getEntryElapsedLabel(block.entry) }}
            </div>
            <p class="submitted-summary__text">
              {{ buildSubmittedFormSummary(block.entry.formSchema, block.entry.formInitialValues) }}
            </p>
          </div>
          <div
            v-else
            class="timeline-form__content"
            :class="{
              'timeline-form__content--disabled': block.entry.formDisabled,
              'timeline-form__content--submitted': block.entry.formVariant === 'submitted',
              'timeline-form__content--active': (block.entry.formVariant || 'active') === 'active'
            }"
          >
            <div
              v-if="getEntryElapsedLabel(block.entry)"
              class="timeline-entry__meta timeline-entry__meta--panel"
            >
              用时 {{ getEntryElapsedLabel(block.entry) }}
            </div>
            <DynamicForm
              :schema="block.entry.formSchema"
              :question="block.entry.formPrompt"
              :initial-values="block.entry.formInitialValues"
              :disabled="block.entry.formDisabled"
              :variant="block.entry.formVariant || 'active'"
              :cancel-text="formCancelText"
              @submit="emit('form-submit', block.entry.id, $event)"
              @cancel="emit('form-cancel', block.entry.id)"
            />
          </div>
        </div>

        <div
          v-else-if="block.entry.type === 'system' && block.entry.content && toRuntimeNotices(block.entry.content).length > 0"
          class="timeline-runtime"
        >
          <div
            v-if="getEntryElapsedLabel(block.entry)"
            class="timeline-entry__meta timeline-entry__meta--panel"
          >
            用时 {{ getEntryElapsedLabel(block.entry) }}
          </div>
          <RuntimeNoticeList
            :notices="toRuntimeNotices(block.entry.content)"
            :fallback-usage="block.entry.runtimeFallbackUsage || null"
            :compact-context-summary="props.compactContextNotices"
          />
        </div>

        <div
          v-else-if="block.entry.content"
          class="timeline-entry"
          :class="`timeline-entry--${block.entry.type}`"
        >
          <div
            v-if="getEntryElapsedLabel(block.entry)"
            class="timeline-entry__meta"
          >
            用时 {{ getEntryElapsedLabel(block.entry) }}
          </div>
          <StructuredContentRenderer
            :content="block.entry.content"
            :animate="block.entry.animate"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped src="./styles.css"></style>
