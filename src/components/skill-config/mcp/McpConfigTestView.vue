<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillConfigStore, type McpTool, type UnifiedMcpConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaJsonViewer, EaStateBlock } from '@/components/common'

const props = defineProps<{
  config: UnifiedMcpConfig
}>()

const emit = defineEmits<{
  back: []
}>()

const { t } = useI18n()
const skillConfigStore = useSkillConfigStore()

const isLoading = ref(false)
const tools = ref<McpTool[]>([])
const testError = ref<string | null>(null)
const selectedTool = ref<McpTool | null>(null)
const paramValues = ref<Record<string, unknown>>({})
const isCalling = ref(false)
const callResult = ref<{ success: boolean; data?: unknown; error?: string } | null>(null)
const activeTab = ref<'params' | 'result'>('params')

async function loadTools() {
  isLoading.value = true
  testError.value = null
  tools.value = []
  selectedTool.value = null
  callResult.value = null

  try {
    const result = await skillConfigStore.listMcpTools(props.config)
    if (result.success) {
      tools.value = result.tools
    } else {
      testError.value = result.message || t('settings.mcp.toolTester.loadFailed')
    }
  } catch (error) {
    testError.value = String(error)
  } finally {
    isLoading.value = false
  }
}

function selectTool(tool: McpTool) {
  selectedTool.value = tool
  paramValues.value = {}
  callResult.value = null
  activeTab.value = 'params'

  const properties = tool.inputSchema?.properties as Record<string, { default?: unknown }> | undefined
  if (!properties) return

  for (const [key, prop] of Object.entries(properties)) {
    if (prop.default !== undefined) {
      paramValues.value[key] = prop.default
    }
  }
}

async function handleCallTool() {
  if (!selectedTool.value) return

  isCalling.value = true
  activeTab.value = 'result'
  callResult.value = null

  try {
    const result = await skillConfigStore.callMcpTool(
      props.config,
      selectedTool.value.name,
      paramValues.value
    )

    callResult.value = {
      success: result.success,
      data: result.result,
      error: result.error
    }
  } catch (error) {
    callResult.value = {
      success: false,
      error: String(error)
    }
  } finally {
    isCalling.value = false
  }
}

function isRequired(paramName: string): boolean {
  const required = selectedTool.value?.inputSchema?.required as string[] | undefined
  return required?.includes(paramName) ?? false
}

function getParamType(paramName: string): string {
  const properties = selectedTool.value?.inputSchema?.properties as Record<string, { type?: string }> | undefined
  return properties?.[paramName]?.type || 'string'
}

void loadTools()
</script>

<template>
  <div class="mcp-test-view">
    <div class="mcp-test-view__header">
      <EaButton
        variant="ghost"
        size="small"
        @click="emit('back')"
      >
        <EaIcon name="lucide:arrow-left" />
        {{ t('common.back') }}
      </EaButton>
      <div class="mcp-test-view__title">
        <EaIcon name="lucide:server" />
        <span>{{ config.name }}</span>
      </div>
    </div>

    <div class="mcp-test-view__content">
      <div class="mcp-test-view__tools">
        <div class="tools-header">
          <h4>{{ t('settings.mcp.toolTester.availableTools') }}</h4>
          <span class="tools-count">{{ tools.length }}</span>
        </div>

        <EaStateBlock
          v-if="isLoading"
          variant="loading"
          :title="t('settings.mcp.toolTester.loadingTools')"
        />

        <EaStateBlock
          v-else-if="testError"
          variant="error"
          :title="t('common.loadFailed')"
          :description="testError"
        >
          <template #actions>
            <EaButton
              size="small"
              variant="ghost"
              @click="loadTools"
            >
              <EaIcon name="lucide:refresh-cw" />
              {{ t('common.retry') }}
            </EaButton>
          </template>
        </EaStateBlock>

        <EaStateBlock
          v-else-if="tools.length === 0"
          icon="lucide:wrench"
          :description="t('settings.mcp.toolTester.noTools')"
        />

        <div
          v-else
          class="tools-list"
        >
          <button
            v-for="tool in tools"
            :key="tool.name"
            class="tool-item"
            :class="{ 'tool-item--active': selectedTool?.name === tool.name }"
            @click="selectTool(tool)"
          >
            <EaIcon
              name="lucide:wrench"
              class="tool-item__icon"
            />
            <div class="tool-item__info">
              <span class="tool-item__name">{{ tool.name }}</span>
              <span class="tool-item__desc">{{ tool.description || '-' }}</span>
            </div>
          </button>
        </div>
      </div>

      <div class="mcp-test-view__main">
        <EaStateBlock
          v-if="!selectedTool"
          icon="lucide:mouse-pointer-click"
          :description="t('settings.mcp.toolTester.selectTool')"
        />

        <template v-else>
          <div class="detail-tabs">
            <button
              class="detail-tab"
              :class="{ 'detail-tab--active': activeTab === 'params' }"
              @click="activeTab = 'params'"
            >
              {{ t('settings.mcp.toolTester.tabParams') }}
            </button>
            <button
              class="detail-tab"
              :class="{ 'detail-tab--active': activeTab === 'result' }"
              @click="activeTab = 'result'"
            >
              {{ t('settings.mcp.toolTester.tabResult') }}
            </button>
          </div>

          <div
            v-show="activeTab === 'params'"
            class="detail-panel"
          >
            <div class="params-header">
              <h4>{{ selectedTool.name }}</h4>
              <p>{{ selectedTool.description }}</p>
            </div>

            <EaStateBlock
              v-if="!selectedTool.inputSchema?.properties"
              :description="t('settings.mcp.toolTester.noParams')"
            />

            <div
              v-else
              class="params-form"
            >
              <div
                v-for="(_prop, key) in selectedTool.inputSchema.properties"
                :key="key"
                class="form-group"
              >
                <label>
                  {{ key }}
                  <span
                    v-if="isRequired(key as string)"
                    class="required"
                  >*</span>
                  <span class="param-type">({{ getParamType(key as string) }})</span>
                </label>

                <input
                  v-if="getParamType(key as string) === 'string' || getParamType(key as string) === 'number'"
                  :value="paramValues[key as string]"
                  :type="getParamType(key as string) === 'number' ? 'number' : 'text'"
                  :placeholder="t('settings.mcp.toolTester.paramPlaceholder')"
                  @input="paramValues[key as string] = ($event.target as HTMLInputElement).value"
                >

                <textarea
                  v-else-if="getParamType(key as string) === 'object' || getParamType(key as string) === 'array'"
                  :value="String(paramValues[key as string] ?? '')"
                  :placeholder="t('settings.mcp.toolTester.jsonPlaceholder')"
                  rows="4"
                  @input="paramValues[key as string] = ($event.target as HTMLTextAreaElement).value"
                />

                <input
                  v-else
                  :value="paramValues[key as string]"
                  type="text"
                  :placeholder="t('settings.mcp.toolTester.paramPlaceholder')"
                  @input="paramValues[key as string] = ($event.target as HTMLInputElement).value"
                >
              </div>
            </div>

            <div class="params-actions">
              <EaButton
                :loading="isCalling"
                @click="handleCallTool"
              >
                <EaIcon name="lucide:play" />
                {{ t('settings.mcp.toolTester.callTool') }}
              </EaButton>
            </div>
          </div>

          <div
            v-show="activeTab === 'result'"
            class="detail-panel"
          >
            <EaStateBlock
              v-if="isCalling"
              variant="loading"
              :title="t('settings.mcp.toolTester.calling')"
            />

            <EaStateBlock
              v-else-if="!callResult"
              :description="t('settings.mcp.toolTester.noResult')"
            />

            <template v-else>
              <div
                v-if="callResult.success"
                class="result-card"
              >
                <h4>{{ t('settings.mcp.toolTester.resultData') }}</h4>
                <EaJsonViewer :data="callResult.data" />
              </div>

              <div
                v-else
                class="result-card result-card--error"
              >
                <h4>{{ t('settings.mcp.toolTester.errorDetails') }}</h4>
                <EaJsonViewer :data="callResult.error" />
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
<style scoped src="./McpConfigTestView.css"></style>
