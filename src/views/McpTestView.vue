<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSkillConfigStore, type McpTool } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const skillConfigStore = useSkillConfigStore()

// 从 store 获取配置信息
const mcpConfig = computed(() => skillConfigStore.testingMcpConfig)
const configName = computed(() => route.query.configName as string || mcpConfig.value?.name || '')

// 状态
const isLoading = ref(false)
const tools = ref<McpTool[]>([])
const selectedTool = ref<McpTool | null>(null)
const paramValues = ref<Record<string, unknown>>({})
const isCalling = ref(false)
const callResult = ref<{ success: boolean; data?: unknown; error?: string } | null>(null)
const activeTab = ref<'params' | 'result'>('params')

// 加载工具列表
async function loadTools() {
  if (!mcpConfig.value) return

  isLoading.value = true
  tools.value = []
  selectedTool.value = null
  callResult.value = null

  try {
    const result = await skillConfigStore.listMcpTools(mcpConfig.value)
    if (result.success) {
      tools.value = result.tools
    }
  } catch (error) {
    console.error('Failed to load tools:', error)
  } finally {
    isLoading.value = false
  }
}

// 选择工具
function selectTool(tool: McpTool) {
  selectedTool.value = tool
  paramValues.value = {}
  callResult.value = null
  activeTab.value = 'params'

  // 初始化参数默认值
  if (tool.inputSchema?.properties) {
    const props = tool.inputSchema.properties as Record<string, { default?: unknown; type?: string }>
    for (const [key, prop] of Object.entries(props)) {
      if (prop.default !== undefined) {
        paramValues.value[key] = prop.default
      }
    }
  }
}

// 调用工具
async function handleCallTool() {
  if (!selectedTool.value || !mcpConfig.value) return

  isCalling.value = true
  callResult.value = null
  activeTab.value = 'result'

  try {
    const result = await skillConfigStore.callMcpTool(
      mcpConfig.value,
      selectedTool.value.name,
      paramValues.value
    )

    callResult.value = {
      success: result.success,
      data: result.result,
      error: result.error,
    }
  } catch (error) {
    callResult.value = {
      success: false,
      error: String(error),
    }
  } finally {
    isCalling.value = false
  }
}

// 返回配置页面
function goBack() {
  skillConfigStore.clearTestingMcpConfig()
  router.back()
}

// 判断参数是否为必填
function isRequired(paramName: string): boolean {
  const required = selectedTool.value?.inputSchema?.required as string[] | undefined
  return required?.includes(paramName) ?? false
}

// 获取参数类型
function getParamType(paramName: string): string {
  const props = selectedTool.value?.inputSchema?.properties as Record<string, { type?: string }> | undefined
  return props?.[paramName]?.type || 'string'
}

// 初始化
onMounted(() => {
  loadTools()
})
</script>

<template>
  <div class="mcp-test-view">
    <!-- 头部 -->
    <div class="mcp-test-view__header">
      <EaButton
        variant="ghost"
        @click="goBack"
      >
        <EaIcon name="lucide:arrow-left" />
        {{ t('common.back') || '返回' }}
      </EaButton>
      <div class="mcp-test-view__title">
        <EaIcon name="lucide:server" />
        <span>{{ configName }}</span>
        <span class="mcp-test-view__subtitle">{{ t('settings.mcp.toolTester.title') }}</span>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="mcp-test-view__content">
      <!-- 左侧工具列表 -->
      <div class="mcp-test-view__tools">
        <div class="tools-header">
          <h3>{{ t('settings.mcp.toolTester.availableTools') }}</h3>
          <span class="tools-count">{{ tools.length }}</span>
        </div>

        <div
          v-if="isLoading"
          class="tools-loading"
        >
          <EaIcon
            name="lucide:loader-2"
            class="tools-loading__spinner"
          />
          {{ t('settings.mcp.toolTester.loadingTools') }}
        </div>

        <div
          v-else-if="tools.length === 0"
          class="tools-empty"
        >
          <EaIcon
            name="lucide:wrench"
            class="tools-empty__icon"
          />
          <p>{{ t('settings.mcp.toolTester.noTools') }}</p>
        </div>

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

      <!-- 右侧参数和结果 -->
      <div class="mcp-test-view__detail">
        <div
          v-if="!selectedTool"
          class="detail-empty"
        >
          <EaIcon
            name="lucide:mouse-pointer-click"
            class="detail-empty__icon"
          />
          <p>{{ t('settings.mcp.toolTester.selectTool') }}</p>
        </div>

        <template v-else>
          <!-- 标签页 -->
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

          <!-- 参数配置 -->
          <div
            v-show="activeTab === 'params'"
            class="detail-params"
          >
            <div class="params-header">
              <h4>{{ selectedTool.name }}</h4>
              <p>{{ selectedTool.description }}</p>
            </div>

            <div
              v-if="!selectedTool.inputSchema?.properties"
              class="params-empty"
            >
              {{ t('settings.mcp.toolTester.noParams') }}
            </div>

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

          <!-- 执行结果 -->
          <div
            v-show="activeTab === 'result'"
            class="detail-result"
          >
            <div
              v-if="isCalling"
              class="result-calling"
            >
              <EaIcon
                name="lucide:loader-2"
                class="result-calling__spinner"
              />
              {{ t('settings.mcp.toolTester.calling') }}
            </div>

            <div
              v-else-if="!callResult"
              class="result-empty"
            >
              {{ t('settings.mcp.toolTester.noResult') }}
            </div>

            <template v-else>
              <div
                v-if="callResult.success"
                class="result-success"
              >
                <h4>{{ t('settings.mcp.toolTester.resultData') }}</h4>
                <pre class="result-json">{{ JSON.stringify(callResult.data, null, 2) }}</pre>
              </div>
              <div
                v-else
                class="result-error"
              >
                <h4>{{ t('settings.mcp.toolTester.errorDetails') }}</h4>
                <pre class="result-json">{{ callResult.error }}</pre>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
<style scoped src="./McpTestView.css"></style>
