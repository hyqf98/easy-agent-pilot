<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillConfigStore, type UnifiedMcpConfig, type McpTool, type McpTransportType, type McpConfigScope } from '@/stores/skillConfig'
import McpConfigItem from '../items/McpConfigItem.vue'
import { EaButton, EaIcon, EaJsonViewer } from '@/components/common'

defineProps<{
  configs: UnifiedMcpConfig[]
  isReadOnly: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'open-file'): void
  (e: 'save', config: Partial<UnifiedMcpConfig>, originalId?: string): void
  (e: 'delete', config: UnifiedMcpConfig): void
}>()

const { t } = useI18n()
const skillConfigStore = useSkillConfigStore()

// 测试视图状态
const testingConfig = ref<UnifiedMcpConfig | null>(null)
const testIsLoading = ref(false)
const testTools = ref<McpTool[]>([])
const testError = ref<string | null>(null)
const selectedTool = ref<McpTool | null>(null)
const paramValues = ref<Record<string, unknown>>({})
const isCalling = ref(false)
const callResult = ref<{ success: boolean; data?: unknown; error?: string } | null>(null)
const testActiveTab = ref<'params' | 'result'>('params')

// 编辑视图状态
const editingConfig = ref<UnifiedMcpConfig | null>(null)
const editForm = ref({
  name: '',
  transportType: 'stdio' as McpTransportType,
  scope: 'user' as McpConfigScope,
  command: '',
  args: '',
  envItems: [] as { key: string; value: string }[],
  url: '',
  headerItems: [] as { key: string; value: string }[],
})

// 计算属性
const configName = computed(() => testingConfig.value?.name || editingConfig.value?.name || '')
const isTesting = computed(() => testingConfig.value !== null)
const isEditing = computed(() => editingConfig.value !== null)
const showList = computed(() => !isTesting.value && !isEditing.value)

// 监听编辑配置变化，更新表单
watch(editingConfig, (newConfig) => {
  if (newConfig) {
    // 将 env 对象转换为 key-value 数组
    const envItems: { key: string; value: string }[] = []
    if (newConfig.env) {
      for (const [key, value] of Object.entries(newConfig.env)) {
        envItems.push({ key, value })
      }
    }

    // 将 headers 对象转换为 key-value 数组
    const headerItems: { key: string; value: string }[] = []
    if (newConfig.headers) {
      for (const [key, value] of Object.entries(newConfig.headers)) {
        headerItems.push({ key, value })
      }
    }

    editForm.value = {
      name: newConfig.name,
      transportType: newConfig.transportType,
      scope: newConfig.scope,
      command: newConfig.command || '',
      args: newConfig.args?.join('\n') || '',
      envItems,
      url: newConfig.url || '',
      headerItems,
    }
  }
})

// 环境变量操作
function addEnvItem() {
  editForm.value.envItems.push({ key: '', value: '' })
}

function removeEnvItem(index: number) {
  editForm.value.envItems.splice(index, 1)
}

// 请求头操作
function addHeaderItem() {
  editForm.value.headerItems.push({ key: '', value: '' })
}

function removeHeaderItem(index: number) {
  editForm.value.headerItems.splice(index, 1)
}

// 测试 MCP 配置
async function handleTest(config: UnifiedMcpConfig) {
  console.log('[MCP Test] Starting test for config:', config.name, config)
  testingConfig.value = config
  testIsLoading.value = true
  testTools.value = []
  testError.value = null
  selectedTool.value = null
  callResult.value = null

  try {
    console.log('[MCP Test] Calling listMcpTools...')
    const result = await skillConfigStore.listMcpTools(config)
    console.log('[MCP Test] Result:', result)
    if (result.success) {
      testTools.value = result.tools
    } else {
      testError.value = result.message || '加载工具列表失败'
    }
  } catch (error) {
    console.error('[MCP Test] Failed to load tools:', error)
    testError.value = String(error)
  } finally {
    testIsLoading.value = false
    console.log('[MCP Test] Test completed')
  }
}

// 编辑 MCP 配置
function handleEdit(config: UnifiedMcpConfig) {
  console.log('handleEdit called with config:', config)
  editingConfig.value = config
}

// 添加 MCP 配置
function handleAdd() {
  editingConfig.value = {
    id: '',
    name: '',
    enabled: true,
    source: 'database',
    isReadOnly: false,
    transportType: 'stdio',
    scope: 'user',
  } as UnifiedMcpConfig
}

// 选择工具
function selectTool(tool: McpTool) {
  selectedTool.value = tool
  paramValues.value = {}
  callResult.value = null
  testActiveTab.value = 'params'

  // 初始化参数默认值
  if (tool.inputSchema?.properties) {
    const toolProps = tool.inputSchema.properties as Record<string, { default?: unknown; type?: string }>
    for (const [key, prop] of Object.entries(toolProps)) {
      if (prop.default !== undefined) {
        paramValues.value[key] = prop.default
      }
    }
  }
}

// 调用工具
async function handleCallTool() {
  if (!selectedTool.value || !testingConfig.value) return

  isCalling.value = true
  callResult.value = null
  testActiveTab.value = 'result'

  try {
    const result = await skillConfigStore.callMcpTool(
      testingConfig.value,
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

// 返回配置列表
function goBackToList() {
  testingConfig.value = null
  editingConfig.value = null
  testTools.value = []
  testError.value = null
  selectedTool.value = null
  callResult.value = null
}

// 保存编辑
function handleSaveEdit() {
  if (!editingConfig.value) return

  // 将 envItems 数组转换为 env 对象
  let env: Record<string, string> | undefined
  if (editForm.value.envItems.length > 0) {
    env = {}
    for (const item of editForm.value.envItems) {
      if (item.key.trim()) {
        env[item.key.trim()] = item.value
      }
    }
    // 如果没有有效的环境变量，设置为 undefined
    if (Object.keys(env).length === 0) {
      env = undefined
    }
  }

  // 将 headerItems 数组转换为 headers 对象
  let headers: Record<string, string> | undefined
  if (editForm.value.headerItems.length > 0) {
    headers = {}
    for (const item of editForm.value.headerItems) {
      if (item.key.trim()) {
        headers[item.key.trim()] = item.value
      }
    }
    // 如果没有有效的请求头，设置为 undefined
    if (Object.keys(headers).length === 0) {
      headers = undefined
    }
  }

  emit('save', {
    name: editForm.value.name,
    transportType: editForm.value.transportType,
    scope: editForm.value.scope,
    command: editForm.value.command || undefined,
    args: editForm.value.args ? editForm.value.args.split('\n').filter(Boolean) : undefined,
    env,
    url: editForm.value.url || undefined,
    headers,
  }, editingConfig.value.id)

  goBackToList()
}

// 判断参数是否为必填
function isRequired(paramName: string): boolean {
  const required = selectedTool.value?.inputSchema?.required as string[] | undefined
  return required?.includes(paramName) ?? false
}

// 获取参数类型
function getParamType(paramName: string): string {
  const toolProps = selectedTool.value?.inputSchema?.properties as Record<string, { type?: string }> | undefined
  return toolProps?.[paramName]?.type || 'string'
}
</script>

<template>
  <div class="mcp-config-tab">
    <!-- 列表视图 -->
    <template v-if="showList">
      <div class="mcp-config-tab__header">
        <h3 class="mcp-config-tab__title">{{ t('settings.sdkConfig.mcp.title') }}</h3>
        <div class="mcp-config-tab__actions">
          <template v-if="!isReadOnly">
            <EaButton size="small" @click="handleAdd">
              <EaIcon name="lucide:plus" />
              {{ t('settings.sdkConfig.mcp.add') }}
            </EaButton>
          </template>
          <template v-else>
            <EaButton size="small" variant="ghost" @click="emit('refresh')">
              <EaIcon name="lucide:refresh-cw" />
              {{ t('common.refresh') }}
            </EaButton>
            <EaButton size="small" variant="ghost" @click="emit('open-file')">
              <EaIcon name="lucide:external-link" />
              {{ t('settings.agentConfig.cliConfigCardTitle') }}
            </EaButton>
          </template>
        </div>
      </div>

      <div v-if="isLoading" class="mcp-config-tab__loading">
        <EaIcon name="lucide:loader-2" class="mcp-config-tab__spinner" />
        {{ t('common.loading') }}
      </div>

      <div v-else-if="configs.length === 0" class="mcp-config-tab__empty">
        <EaIcon name="lucide:server" class="mcp-config-tab__empty-icon" />
        <p>{{ t('settings.sdkConfig.mcp.noConfigs') }}</p>
      </div>

      <div v-else class="mcp-config-tab__list">
        <McpConfigItem
          v-for="config in configs"
          :key="config.id"
          :config="config"
          :is-read-only="isReadOnly"
          @test="handleTest"
          @edit="handleEdit"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>

    <!-- 编辑视图 -->
    <template v-else-if="isEditing">
      <div class="mcp-edit-detail">
        <!-- 头部 -->
        <div class="mcp-edit-detail__header">
          <EaButton variant="ghost" size="small" @click="goBackToList">
            <EaIcon name="lucide:arrow-left" />
            {{ t('common.back') }}
          </EaButton>
          <div class="mcp-edit-detail__title">
            <EaIcon name="lucide:pencil" />
            <span>{{ t('settings.sdkConfig.mcp.edit') }}: {{ configName }}</span>
          </div>
        </div>

        <!-- 编辑表单 -->
        <div class="mcp-edit-detail__content">
          <div class="edit-form">
            <div class="form-group">
              <label>{{ t('settings.sdkConfig.mcp.name') }}</label>
              <input
                v-model="editForm.name"
                type="text"
                :placeholder="t('settings.sdkConfig.mcp.namePlaceholder')"
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="label-with-icon">
                  <EaIcon name="lucide:plug" class="label-icon" />
                  {{ t('settings.sdkConfig.mcp.transportType') }}
                </label>
                <select v-model="editForm.transportType" class="select-transport">
                  <option value="stdio">(STDIO) 标准输入输出</option>
                  <option value="sse">(SSE) 服务器推送事件</option>
                  <option value="http">(HTTP) HTTP 请求</option>
                </select>
              </div>
              <div class="form-group">
                <label class="label-with-icon">
                  <EaIcon name="lucide:map-pin" class="label-icon" />
                  {{ t('settings.sdkConfig.mcp.scope') }}
                </label>
                <select v-model="editForm.scope" class="select-scope">
                  <option value="user">{{ t('settings.agent.scan.scopeTypes.user') }}</option>
                  <option value="local">{{ t('settings.agent.scan.scopeTypes.local') }}</option>
                  <option value="project">{{ t('settings.agent.scan.scopeTypes.project') }}</option>
                </select>
              </div>
            </div>

            <template v-if="editForm.transportType === 'stdio'">
              <div class="form-group">
                <label>{{ t('settings.sdkConfig.mcp.command') }}</label>
                <input
                  v-model="editForm.command"
                  type="text"
                  :placeholder="t('settings.sdkConfig.mcp.commandPlaceholder')"
                />
              </div>
              <div class="form-group">
                <label>{{ t('settings.sdkConfig.mcp.args') }}</label>
                <textarea
                  v-model="editForm.args"
                  :placeholder="t('settings.sdkConfig.mcp.argsPlaceholder')"
                  rows="3"
                ></textarea>
              </div>
              <div class="form-group">
                <label class="label-with-icon">
                  <EaIcon name="lucide:variable" class="label-icon" />
                  {{ t('settings.sdkConfig.mcp.env') }}
                </label>
                <div class="env-list">
                  <div
                    v-for="(item, index) in editForm.envItems"
                    :key="index"
                    class="env-item"
                  >
                    <input
                      v-model="item.key"
                      type="text"
                      placeholder="KEY"
                      class="env-key"
                    />
                    <span class="env-equals">=</span>
                    <input
                      v-model="item.value"
                      type="text"
                      placeholder="value"
                      class="env-value"
                    />
                    <button
                      type="button"
                      class="env-remove"
                      @click="removeEnvItem(index)"
                      title="删除"
                    >
                      <EaIcon name="lucide:x" />
                    </button>
                  </div>
                  <button
                    type="button"
                    class="env-add"
                    @click="addEnvItem"
                  >
                    <EaIcon name="lucide:plus" />
                    添加环境变量
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="form-group">
                <label>URL</label>
                <input
                  v-model="editForm.url"
                  type="text"
                  placeholder="https://example.com/mcp"
                />
              </div>
              <div class="form-group">
                <label class="label-with-icon">
                  <EaIcon name="lucide:file-text" class="label-icon" />
                  {{ t('settings.sdkConfig.mcp.headers') }}
                </label>
                <div class="env-list">
                  <div
                    v-for="(item, index) in editForm.headerItems"
                    :key="index"
                    class="env-item"
                  >
                    <input
                      v-model="item.key"
                      type="text"
                      placeholder="Header Name"
                      class="env-key"
                    />
                    <span class="env-equals">:</span>
                    <input
                      v-model="item.value"
                      type="text"
                      placeholder="Header Value"
                      class="env-value"
                    />
                    <button
                      type="button"
                      class="env-remove"
                      @click="removeHeaderItem(index)"
                      title="删除"
                    >
                      <EaIcon name="lucide:x" />
                    </button>
                  </div>
                  <button
                    type="button"
                    class="env-add"
                    @click="addHeaderItem"
                  >
                    <EaIcon name="lucide:plus" />
                    添加请求头
                  </button>
                </div>
              </div>
            </template>
          </div>

          <div class="edit-actions">
            <EaButton variant="ghost" @click="goBackToList">{{ t('common.cancel') }}</EaButton>
            <EaButton @click="handleSaveEdit">{{ t('common.save') }}</EaButton>
          </div>
        </div>
      </div>
    </template>

    <!-- 测试详情视图 -->
    <template v-else-if="isTesting">
      <div class="mcp-test-detail">
        <!-- 头部 -->
        <div class="mcp-test-detail__header">
          <EaButton variant="ghost" size="small" @click="goBackToList">
            <EaIcon name="lucide:arrow-left" />
            {{ t('common.back') }}
          </EaButton>
          <div class="mcp-test-detail__title">
            <EaIcon name="lucide:server" />
            <span>{{ configName }}</span>
          </div>
        </div>

        <!-- 主内容区 -->
        <div class="mcp-test-detail__content">
          <!-- 左侧工具列表 -->
          <div class="mcp-test-detail__tools">
            <div class="tools-header">
              <h4>{{ t('settings.mcp.toolTester.availableTools') }}</h4>
              <span class="tools-count">{{ testTools.length }}</span>
            </div>

            <div v-if="testIsLoading" class="tools-loading">
              <EaIcon name="lucide:loader-2" class="tools-loading__spinner" />
              {{ t('settings.mcp.toolTester.loadingTools') }}
            </div>

            <div v-else-if="testError" class="tools-error">
              <EaIcon name="lucide:alert-circle" class="tools-error__icon" />
              <p class="tools-error__title">加载失败</p>
              <p class="tools-error__message">{{ testError }}</p>
              <EaButton size="small" variant="ghost" @click="handleTest(testingConfig!)">
                <EaIcon name="lucide:refresh-cw" />
                重试
              </EaButton>
            </div>

            <div v-else-if="testTools.length === 0" class="tools-empty">
              <EaIcon name="lucide:wrench" class="tools-empty__icon" />
              <p>{{ t('settings.mcp.toolTester.noTools') }}</p>
            </div>

            <div v-else class="tools-list">
              <button
                v-for="tool in testTools"
                :key="tool.name"
                class="tool-item"
                :class="{ 'tool-item--active': selectedTool?.name === tool.name }"
                @click="selectTool(tool)"
              >
                <EaIcon name="lucide:wrench" class="tool-item__icon" />
                <div class="tool-item__info">
                  <span class="tool-item__name">{{ tool.name }}</span>
                  <span class="tool-item__desc">{{ tool.description || '-' }}</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 右侧参数和结果 -->
          <div class="mcp-test-detail__main">
            <div v-if="!selectedTool" class="detail-empty">
              <EaIcon name="lucide:mouse-pointer-click" class="detail-empty__icon" />
              <p>{{ t('settings.mcp.toolTester.selectTool') }}</p>
            </div>

            <template v-else>
              <!-- 标签页 -->
              <div class="detail-tabs">
                <button
                  class="detail-tab"
                  :class="{ 'detail-tab--active': testActiveTab === 'params' }"
                  @click="testActiveTab = 'params'"
                >
                  {{ t('settings.mcp.toolTester.tabParams') }}
                </button>
                <button
                  class="detail-tab"
                  :class="{ 'detail-tab--active': testActiveTab === 'result' }"
                  @click="testActiveTab = 'result'"
                >
                  {{ t('settings.mcp.toolTester.tabResult') }}
                </button>
              </div>

              <!-- 参数配置 -->
              <div v-show="testActiveTab === 'params'" class="detail-params">
                <div class="params-header">
                  <h4>{{ selectedTool.name }}</h4>
                  <p>{{ selectedTool.description }}</p>
                </div>

                <div v-if="!selectedTool.inputSchema?.properties" class="params-empty">
                  {{ t('settings.mcp.toolTester.noParams') }}
                </div>

                <div v-else class="params-form">
                  <div
                    v-for="(_prop, key) in selectedTool.inputSchema.properties"
                    :key="key"
                    class="form-group"
                  >
                    <label>
                      {{ key }}
                      <span v-if="isRequired(key as string)" class="required">*</span>
                      <span class="param-type">({{ getParamType(key as string) }})</span>
                    </label>
                    <input
                      v-if="getParamType(key as string) === 'string' || getParamType(key as string) === 'number'"
                      :value="paramValues[key as string] as string | number | undefined"
                      @input="paramValues[key as string] = ($event.target as HTMLInputElement).value"
                      :type="getParamType(key as string) === 'number' ? 'number' : 'text'"
                      :placeholder="t('settings.mcp.toolTester.paramPlaceholder')"
                    />
                    <textarea
                      v-else-if="getParamType(key as string) === 'object' || getParamType(key as string) === 'array'"
                      :value="String(paramValues[key as string] ?? '')"
                      @input="paramValues[key as string] = ($event.target as HTMLTextAreaElement).value"
                      :placeholder="t('settings.mcp.toolTester.jsonPlaceholder')"
                      rows="4"
                    ></textarea>
                    <input
                      v-else
                      :value="paramValues[key as string] as string | undefined"
                      @input="paramValues[key as string] = ($event.target as HTMLInputElement).value"
                      type="text"
                      :placeholder="t('settings.mcp.toolTester.paramPlaceholder')"
                    />
                  </div>
                </div>

                <div class="params-actions">
                  <EaButton @click="handleCallTool" :loading="isCalling">
                    <EaIcon name="lucide:play" />
                    {{ t('settings.mcp.toolTester.callTool') }}
                  </EaButton>
                </div>
              </div>

              <!-- 执行结果 -->
              <div v-show="testActiveTab === 'result'" class="detail-result">
                <div v-if="isCalling" class="result-calling">
                  <EaIcon name="lucide:loader-2" class="result-calling__spinner" />
                  {{ t('settings.mcp.toolTester.calling') }}
                </div>

                <div v-else-if="!callResult" class="result-empty">
                  {{ t('settings.mcp.toolTester.noResult') }}
                </div>

                <template v-else>
                  <div v-if="callResult.success" class="result-success">
                    <h4>{{ t('settings.mcp.toolTester.resultData') }}</h4>
                    <EaJsonViewer :data="callResult.data" />
                  </div>
                  <div v-else class="result-error">
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
  </div>
</template>

<style scoped>
.mcp-config-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-4);
}

.mcp-config-tab__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.mcp-config-tab__actions {
  display: flex;
  gap: var(--spacing-2);
}

.mcp-config-tab__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.mcp-config-tab__spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.mcp-config-tab__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.mcp-config-tab__empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.mcp-config-tab__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

/* 编辑详情视图 */
.mcp-edit-detail {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.mcp-edit-detail__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.mcp-edit-detail__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.mcp-edit-detail__content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding: var(--spacing-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.edit-form .form-group {
  margin-bottom: 0;
}

.edit-form .form-group label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-2);
  color: var(--color-text-secondary);
}

.edit-form .form-group .label-with-icon {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.edit-form .form-group .label-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.edit-form .form-group input[type="text"],
.edit-form .form-group textarea {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.edit-form .form-group input:focus,
.edit-form .form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-bg);
}

/* 下拉框优化样式 */
.edit-form .form-group select {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-8) var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
}

.edit-form .form-group select:hover {
  border-color: var(--color-primary);
}

.edit-form .form-group select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-bg);
}

.edit-form .form-group select option {
  padding: var(--spacing-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.edit-form .form-group textarea {
  font-family: var(--font-family-mono);
  resize: vertical;
  min-height: 80px;
}

.edit-form .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-4);
}

/* 环境变量列表样式 */
.env-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.env-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.env-key {
  flex: 1;
  min-width: 0;
  padding: var(--spacing-2) var(--spacing-3) !important;
  font-size: var(--font-size-sm) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: var(--radius-md) !important;
  background: var(--color-background) !important;
  color: var(--color-text) !important;
  font-family: var(--font-family-mono) !important;
}

.env-key:focus {
  outline: none !important;
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 3px var(--color-primary-bg) !important;
}

.env-equals {
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-medium);
  flex-shrink: 0;
}

.env-value {
  flex: 2;
  min-width: 0;
  padding: var(--spacing-2) var(--spacing-3) !important;
  font-size: var(--font-size-sm) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: var(--radius-md) !important;
  background: var(--color-background) !important;
  color: var(--color-text) !important;
}

.env-value:focus {
  outline: none !important;
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 3px var(--color-primary-bg) !important;
}

.env-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
  color: #dc2626;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.env-remove:hover {
  background: rgba(239, 68, 68, 0.2);
}

.env-remove svg {
  width: 14px;
  height: 14px;
}

.env-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-1);
  padding: var(--spacing-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.env-add:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.env-add svg {
  width: 14px;
  height: 14px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--color-border);
}

/* 测试详情视图 */
.mcp-test-detail {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.mcp-test-detail__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.mcp-test-detail__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.mcp-test-detail__content {
  display: flex;
  gap: var(--spacing-4);
  min-height: 400px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* 左侧工具列表 */
.mcp-test-detail__tools {
  width: 260px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
}

.tools-header h4 {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.tools-count {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
}

.tools-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-6);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.tools-loading__spinner {
  width: 14px;
  height: 14px;
  animation: spin 1s linear infinite;
}

.tools-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
  color: var(--color-danger);
  text-align: center;
}

.tools-error__icon {
  width: 24px;
  height: 24px;
}

.tools-error__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  margin: 0;
}

.tools-error__message {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin: 0;
  word-break: break-word;
}

.tools-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-6);
  color: var(--color-text-tertiary);
}

.tools-empty__icon {
  width: 24px;
  height: 24px;
  opacity: 0.5;
}

.tools-list {
  flex: 1;
  overflow-y: auto;
}

.tool-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2);
  width: 100%;
  padding: var(--spacing-2) var(--spacing-3);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid var(--color-border);
}

.tool-item:hover {
  background: var(--color-background-secondary);
}

.tool-item--active {
  background: var(--color-primary-bg);
}

.tool-item__icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.tool-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.tool-item__name {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-item__desc {
  font-size: 11px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧主内容区 */
.mcp-test-detail__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-background);
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  flex: 1;
  color: var(--color-text-tertiary);
}

.detail-empty__icon {
  width: 32px;
  height: 32px;
  opacity: 0.3;
}

.detail-tabs {
  display: flex;
  gap: var(--spacing-1);
  padding: var(--spacing-2);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.detail-tab {
  padding: var(--spacing-1) var(--spacing-3);
  border: none;
  background: transparent;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.detail-tab:hover {
  color: var(--color-text);
  background: var(--color-background-secondary);
}

.detail-tab--active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

/* 参数配置 */
.detail-params {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.params-header {
  padding: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.params-header h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-1);
}

.params-header p {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin: 0;
}

.params-empty {
  padding: var(--spacing-4);
  color: var(--color-text-secondary);
  text-align: center;
  font-size: var(--font-size-sm);
}

.params-form {
  flex: 1;
  padding: var(--spacing-3);
  overflow-y: auto;
}

.form-group {
  margin-bottom: var(--spacing-3);
}

.form-group label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-1);
  color: var(--color-text-secondary);
}

.form-group .required {
  color: var(--color-danger);
  margin-left: 2px;
}

.form-group .param-type {
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-normal);
  margin-left: var(--spacing-1);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: var(--spacing-2);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-group textarea {
  font-family: var(--font-family-mono);
  resize: vertical;
  min-height: 80px;
}

.params-actions {
  padding: var(--spacing-3);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

/* 执行结果 */
.detail-result {
  flex: 1;
  padding: var(--spacing-3);
  overflow-y: auto;
}

.result-calling {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-6);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.result-calling__spinner {
  width: 14px;
  height: 14px;
  animation: spin 1s linear infinite;
}

.result-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-6);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.result-success,
.result-error {
  padding: var(--spacing-3);
  border-radius: var(--radius-md);
}

.result-success {
  background: var(--color-success-bg);
}

.result-error {
  background: var(--color-danger-bg);
}

.result-success h4,
.result-error h4 {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-2);
}

.result-success h4 {
  color: var(--color-success);
}

.result-error h4 {
  color: var(--color-danger);
}

.result-json {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  padding: var(--spacing-2);
  background: var(--color-background-secondary);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}
</style>
