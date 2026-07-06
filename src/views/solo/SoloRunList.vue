<script setup lang="ts">
import { useSoloRunList } from './useSoloRunList'
import type { SoloRunListProps, SoloRunListEmits } from './useSoloRunList'

const props = defineProps<SoloRunListProps>()
const emit = defineEmits<SoloRunListEmits>()

const {
  EaSidebarSectionHeader,
  EaIcon,
  groupedRuns,
  statusLabel,
  formatTime
} = useSoloRunList(props)
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
