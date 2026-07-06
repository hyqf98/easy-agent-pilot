<script setup lang="ts">
import { useMcpTestView } from './useMcpTestView'

const {
  EaButton,
  EaIcon,
  t,
  configName,
  isLoading,
  tools,
  selectedTool,
  paramValues,
  isCalling,
  callResult,
  activeTab,
  selectTool,
  handleCallTool,
  goBack,
  isRequired,
  getParamType
} = useMcpTestView()
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
