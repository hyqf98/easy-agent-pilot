<script setup lang="ts">
import { computed } from 'vue'
import type { SoloRun } from '@/types/solo'
import { EaSidebarSectionHeader, EaIcon } from '@/components/common'

const props = defineProps<{
  runs: SoloRun[]
  currentRunId: string | null
}>()

const emit = defineEmits<{
  select: [runId: string]
  create: []
  hide: []
}>()

const groupedRuns = computed(() => {
  const order: SoloRun['status'][] = ['running', 'blocked', 'paused', 'draft', 'failed', 'completed', 'stopped']
  return order
    .map((status) => ({
      status,
      items: props.runs.filter((run) => run.status === status)
    }))
    .filter((group) => group.items.length > 0)
})

function statusLabel(status: SoloRun['status']): string {
  switch (status) {
    case 'running': return '执行中'
    case 'blocked': return '待输入'
    case 'paused': return '已暂停'
    case 'draft': return '草稿'
    case 'failed': return '失败'
    case 'completed': return '完成'
    case 'stopped': return '已停止'
    default: return status
  }
}

function formatTime(value: string): string {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <div class="solo-run-list">
    <EaSidebarSectionHeader
      title="自主运行"
      create-title="新建 SOLO 运行"
      @create="emit('create')"
      @hide="emit('hide')"
    />

    <div
      class="solo-run-list__groups"
    >
      <div
        v-if="groupedRuns.length === 0"
        class="solo-run-list__empty"
      >
        <EaIcon
          name="route"
          :size="40"
        />
        <p>暂无 SOLO 运行，点击"新建"开始</p>
      </div>

      <section
        v-for="group in groupedRuns"
        :key="group.status"
        class="solo-run-list__group"
      >
        <div class="solo-run-list__group-header">
          <span>{{ statusLabel(group.status) }}</span>
          <strong>{{ group.items.length }}</strong>
        </div>

        <button
          v-for="run in group.items"
          :key="run.id"
          class="solo-run-card"
          :class="[
            `solo-run-card--${run.status}`,
            { 'solo-run-card--active': run.id === currentRunId }
          ]"
          @click="emit('select', run.id)"
        >
          <div class="solo-run-card__title-row">
            <strong>{{ run.name }}</strong>
            <span class="solo-run-card__status">{{ statusLabel(run.status) }}</span>
          </div>
          <p class="solo-run-card__goal">
            {{ run.goal }}
          </p>
          <div class="solo-run-card__meta">
            <span>深度 {{ run.currentDepth }}/{{ run.maxDispatchDepth }}</span>
            <span>{{ formatTime(run.updatedAt) }}</span>
          </div>
        </button>
      </section>
    </div>
  </div>
</template>
<style scoped src="./SoloRunList.css"></style>
