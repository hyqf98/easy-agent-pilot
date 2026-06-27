<script setup lang="ts">
import { EaIcon } from '@/components/common'
import { useFileChangeSummaryBar, type FileChangeSummaryBarProps } from './useFileChangeSummaryBar'

const props = defineProps<FileChangeSummaryBarProps>()

const {
  t,
  traces,
  visible,
  expanded,
  pendingCount,
  changeTypeMeta,
  lineStats,
  toggleExpand,
  reviewAll,
  reviewOne
} = useFileChangeSummaryBar(props)
</script>

<template>
  <div
    v-if="visible"
    class="file-change-summary"
  >
    <!-- 收起态：单行汇总条 -->
    <button
      type="button"
      class="file-change-summary__bar"
      :class="{ 'file-change-summary__bar--expanded': expanded }"
      @click="toggleExpand"
    >
      <span class="file-change-summary__icon">
        <EaIcon
          name="file-stack"
          :size="14"
        />
      </span>
      <span class="file-change-summary__label">
        {{ t('fileChange.modifiedFiles', { count: traces.length }) }}
      </span>
      <span
        v-if="pendingCount > 0 && pendingCount < traces.length"
        class="file-change-summary__pending"
      >
        {{ t('fileChange.pendingReview', { count: pendingCount }) }}
      </span>
      <span class="file-change-summary__spacer" />
      <span
        class="file-change-summary__review"
        @click.stop="reviewAll"
      >
        <EaIcon
          name="scan-eye"
          :size="12"
        />
        {{ t('fileChange.reviewAll') }}
      </span>
      <EaIcon
        class="file-change-summary__chevron"
        :class="{ 'file-change-summary__chevron--open': expanded }"
        name="chevron-right"
        :size="14"
      />
    </button>

    <!-- 展开态：紧凑文件列表 -->
    <ul
      v-if="expanded"
      class="file-change-summary__list"
    >
      <li
        v-for="tr in traces"
        :key="tr.id"
        class="file-change-summary__item"
        :class="[
          `file-change-summary__item--${changeTypeMeta(tr.changeType).dot}`,
          { 'file-change-summary__item--resolved': (tr.status ?? 'pending') !== 'pending' }
        ]"
        @click="(tr.status ?? 'pending') === 'pending' ? reviewOne(tr) : null"
      >
        <span class="file-change-summary__dot" />
        <EaIcon
          class="file-change-summary__type-icon"
          :name="changeTypeMeta(tr.changeType).icon"
          :size="13"
        />
        <span
          class="file-change-summary__path"
          :title="tr.filePath"
        >{{ tr.relativePath }}</span>
        <template v-if="(tr.status ?? 'pending') === 'pending'">
          <span class="file-change-summary__stats">
            <span
              v-if="lineStats(tr).added > 0"
              class="file-change-summary__added"
            >+{{ lineStats(tr).added }}</span>
            <span
              v-if="lineStats(tr).removed > 0"
              class="file-change-summary__removed"
            >-{{ lineStats(tr).removed }}</span>
          </span>
          <EaIcon
            class="file-change-summary__go"
            name="chevron-right"
            :size="13"
          />
        </template>
        <template v-else>
          <span class="file-change-summary__status">
            <EaIcon
              :name="tr.status === 'accepted' ? 'check' : 'undo-2'"
              :size="12"
            />
            {{ tr.status === 'accepted' ? t('fileChange.accepted') : t('fileChange.rolledBack') }}
          </span>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped src="./styles.css"></style>
