<script setup lang="ts">
/** RepoRunTab 组件：记忆库仓库「运行」标签页，输入归纳指令并运行产出（逻辑见 useRepoRunTab.ts） */
import { useRepoRunTab } from './useRepoRunTab'
import { EaButton, EaIcon } from '@/components/common'

const { t, instruction, isRunning, output, lastError, activeRepo, isReady, run, applyPreset } =
  useRepoRunTab()
</script>

<template>
  <div class="repo-run-tab">
    <div class="repo-run-tab__presets">
      <button
        type="button"
        class="repo-run-tab__preset"
        @click="applyPreset('归纳今日对话历史，更新本仓库文件')"
      >
        归纳今日历史
      </button>
      <button
        type="button"
        class="repo-run-tab__preset"
        @click="applyPreset('整理本仓库现有内容，去重并优化结构')"
      >
        整理现有内容
      </button>
      <button
        type="button"
        class="repo-run-tab__preset"
        @click="applyPreset('读取本机近期编辑器/IDE 会话，提取可复用的开发经验写入仓库')"
      >
        提取本机经验
      </button>
    </div>

    <label class="repo-run-tab__field">
      <span>归纳指令</span>
      <textarea
        v-model="instruction"
        class="repo-run-tab__textarea"
        rows="4"
        placeholder="告诉 AI 要归纳/整理什么。例如：归纳今日对话历史，提取长期可复用的开发经验，更新 SKILL.md。"
      />
    </label>

    <div class="repo-run-tab__actions">
      <EaButton
        variant="primary"
        size="small"
        :disabled="!isReady || isRunning"
        :loading="isRunning"
        @click="run"
      >
        <EaIcon
          name="lucide:play"
          :size="14"
        />
        {{ isRunning ? t('memoryRepo.running') : t('memoryRepo.runNow') }}
      </EaButton>
      <span
        v-if="activeRepo && !activeRepo.agentId"
        class="repo-run-tab__warn"
      >{{ t('memoryRepo.noAgentBound') }}</span>
      <span
        v-if="activeRepo && !activeRepo.internalToolsEnabled"
        class="repo-run-tab__hint"
      >{{ t('memoryRepo.internalToolsOff') }}</span>
    </div>

    <div
      v-if="output || lastError || isRunning"
      class="repo-run-tab__output"
    >
      <div class="repo-run-tab__output-header">
        <EaIcon
          v-if="isRunning"
          name="lucide:loader-2"
          :size="14"
          class="repo-run-tab__spinner"
        />
        <span>{{ isRunning ? t('memoryRepo.running') : t('memoryRepo.output') }}</span>
      </div>
      <pre
        v-if="lastError"
        class="repo-run-tab__error"
      >{{ lastError }}</pre>
      <pre
        v-else
        class="repo-run-tab__content"
      >{{ output || (isRunning ? '…' : '') }}</pre>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
