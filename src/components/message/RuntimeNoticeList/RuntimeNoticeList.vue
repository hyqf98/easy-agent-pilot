<script setup lang="ts">
/** RuntimeNoticeList 组件：运行时通知列表，聚合模型/用量通知并可展开明细（逻辑见 useRuntimeNoticeList.ts） */
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer.vue'
import { EaIcon } from '@/components/common'
import { useRuntimeNoticeList, type RuntimeNoticeListProps } from './useRuntimeNoticeList'

const props = withDefaults(defineProps<RuntimeNoticeListProps>(), {
  defaultExpanded: false,
  fallbackUsage: null,
  compactContextSummary: false
})

const {
  t,
  shouldUseCombinedSummary,
  primaryRegularNotice,
  primaryUsageNotice,
  extraRegularNotices,
  extraUsageNotices,
  noticeChips,
  isExpanded,
  toggleNotice,
  usageModelLabel,
  usageSummary,
  isUsageNotice,
  isCompactContextNotice,
  compactContextNoticeChips
} = useRuntimeNoticeList(props)
</script>

<template>
  <div class="runtime-notice-list">
    <article
      v-if="shouldUseCombinedSummary && primaryRegularNotice && primaryUsageNotice"
      class="runtime-notice runtime-notice--summary"
      :class="`runtime-notice--${primaryRegularNotice.tone || 'info'}`"
    >
      <div class="runtime-notice__summary">
        <button
          type="button"
          class="runtime-notice__summary-runtime"
          @click="toggleNotice(primaryRegularNotice.id)"
        >
          <div class="runtime-notice__summary-runtime-main">
            <div class="runtime-notice__header-main">
              <span class="runtime-notice__eyebrow">{{ t('message.runtimeNotice.runtime') }}</span>
              <span class="runtime-notice__title">{{ primaryRegularNotice.title }}</span>
            </div>
            <div
              v-if="noticeChips(primaryRegularNotice).length > 0"
              class="runtime-notice__chips runtime-notice__chips--leading"
            >
              <span
                v-for="chip in noticeChips(primaryRegularNotice)"
                :key="chip"
                class="runtime-notice__chip"
              >
                {{ chip }}
              </span>
            </div>
          </div>
          <span
            class="runtime-notice__chevron"
            :class="{ 'runtime-notice__chevron--expanded': isExpanded(primaryRegularNotice.id) }"
          >
            <EaIcon
              name="chevron-down"
              :size="12"
            />
          </span>
        </button>

        <div class="runtime-notice__summary-usage">
          <div class="runtime-notice__usage-main">
            <span class="runtime-notice__usage-label">{{ t('message.runtimeNotice.model') }}</span>
            <span class="runtime-notice__usage-model">
              {{ usageModelLabel(primaryUsageNotice) }}
            </span>
          </div>
          <div class="runtime-notice__usage-stats">
            <span class="runtime-notice__usage-chip runtime-notice__usage-chip--input">
              {{ t('message.runtimeNotice.input') }} {{ usageSummary(primaryUsageNotice)?.input || '—' }}
            </span>
            <span class="runtime-notice__usage-chip runtime-notice__usage-chip--output">
              {{ t('message.runtimeNotice.output') }} {{ usageSummary(primaryUsageNotice)?.output || '—' }}
            </span>
          </div>
        </div>
      </div>

      <div
        v-show="isExpanded(primaryRegularNotice.id)"
        class="runtime-notice__content"
      >
        <MarkdownRenderer :content="primaryRegularNotice.content" />
      </div>
    </article>

    <template v-if="shouldUseCombinedSummary">
      <article
        v-for="notice in extraRegularNotices"
        :key="notice.id"
        class="runtime-notice"
        :class="`runtime-notice--${notice.tone || 'info'}`"
      >
        <button
          type="button"
          class="runtime-notice__header"
          @click="toggleNotice(notice.id)"
        >
          <div class="runtime-notice__header-main">
            <span class="runtime-notice__eyebrow">{{ t('message.runtimeNotice.runtime') }}</span>
            <span class="runtime-notice__title">{{ notice.title }}</span>
          </div>
          <div class="runtime-notice__header-side">
            <div
              v-if="noticeChips(notice).length > 0"
              class="runtime-notice__chips"
            >
              <span
                v-for="chip in noticeChips(notice)"
                :key="chip"
                class="runtime-notice__chip"
              >
                {{ chip }}
              </span>
            </div>
            <span
              class="runtime-notice__chevron"
              :class="{ 'runtime-notice__chevron--expanded': isExpanded(notice.id) }"
            >
              <EaIcon
                name="chevron-down"
                :size="12"
              />
            </span>
          </div>
        </button>

        <div
          v-show="isExpanded(notice.id)"
          class="runtime-notice__content"
        >
          <MarkdownRenderer :content="notice.content" />
        </div>
      </article>

      <article
        v-for="notice in extraUsageNotices"
        :key="notice.id"
        class="runtime-notice runtime-notice--usage"
        :class="`runtime-notice--${notice.tone || 'info'}`"
      >
        <div class="runtime-notice__usage">
          <div class="runtime-notice__usage-main">
            <span class="runtime-notice__usage-label">{{ t('message.runtimeNotice.model') }}</span>
            <span class="runtime-notice__usage-model">
              {{ usageModelLabel(notice) }}
            </span>
          </div>
          <div class="runtime-notice__usage-stats">
            <span class="runtime-notice__usage-chip runtime-notice__usage-chip--input">
              {{ t('message.runtimeNotice.input') }} {{ usageSummary(notice)?.input || '—' }}
            </span>
            <span class="runtime-notice__usage-chip runtime-notice__usage-chip--output">
              {{ t('message.runtimeNotice.output') }} {{ usageSummary(notice)?.output || '—' }}
            </span>
          </div>
        </div>
      </article>
    </template>

    <template v-else>
      <article
        v-for="notice in notices"
        :key="notice.id"
        class="runtime-notice"
        :class="[
          `runtime-notice--${notice.tone || 'info'}`,
          { 'runtime-notice--usage': isUsageNotice(notice) }
        ]"
      >
        <div
          v-if="isUsageNotice(notice)"
          class="runtime-notice__usage"
        >
          <div class="runtime-notice__usage-main">
            <span class="runtime-notice__usage-label">{{ t('message.runtimeNotice.model') }}</span>
            <span class="runtime-notice__usage-model">
              {{ usageModelLabel(notice) }}
            </span>
          </div>
          <div class="runtime-notice__usage-stats">
            <span class="runtime-notice__usage-chip runtime-notice__usage-chip--input">
              {{ t('message.runtimeNotice.input') }} {{ usageSummary(notice)?.input || '—' }}
            </span>
            <span class="runtime-notice__usage-chip runtime-notice__usage-chip--output">
              {{ t('message.runtimeNotice.output') }} {{ usageSummary(notice)?.output || '—' }}
            </span>
          </div>
        </div>

        <template v-else>
          <div
            v-if="isCompactContextNotice(notice)"
            class="runtime-notice__header runtime-notice__header--static"
          >
            <div class="runtime-notice__header-main">
              <span class="runtime-notice__eyebrow">{{ t('message.runtimeNotice.runtime') }}</span>
              <span class="runtime-notice__title">{{ notice.title }}</span>
            </div>
            <div class="runtime-notice__header-side">
              <div
                v-if="compactContextNoticeChips(notice).length > 0"
                class="runtime-notice__chips"
              >
                <span
                  v-for="chip in compactContextNoticeChips(notice)"
                  :key="chip"
                  class="runtime-notice__chip"
                >
                  {{ chip }}
                </span>
              </div>
            </div>
          </div>

          <button
            v-else
            type="button"
            class="runtime-notice__header"
            @click="toggleNotice(notice.id)"
          >
            <div class="runtime-notice__header-main">
              <span class="runtime-notice__eyebrow">{{ t('message.runtimeNotice.runtime') }}</span>
              <span class="runtime-notice__title">{{ notice.title }}</span>
            </div>
            <div class="runtime-notice__header-side">
              <div
                v-if="noticeChips(notice).length > 0"
                class="runtime-notice__chips"
              >
                <span
                  v-for="chip in noticeChips(notice)"
                  :key="chip"
                  class="runtime-notice__chip"
                >
                  {{ chip }}
                </span>
              </div>
              <span
                class="runtime-notice__chevron"
                :class="{ 'runtime-notice__chevron--expanded': isExpanded(notice.id) }"
              >
                <EaIcon
                  name="chevron-down"
                  :size="12"
                />
              </span>
            </div>
          </button>

          <div
            v-if="!isCompactContextNotice(notice)"
            v-show="isExpanded(notice.id)"
            class="runtime-notice__content"
          >
            <MarkdownRenderer :content="notice.content" />
          </div>
        </template>
      </article>
    </template>
  </div>
</template>

<style scoped src="./styles.css"></style>
