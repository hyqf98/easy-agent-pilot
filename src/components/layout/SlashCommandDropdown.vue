<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { SlashCommandDescriptor } from '@/services/slashCommands'

const props = defineProps<{
  visible: boolean
  position: { x: number; y: number; width: number; height: number }
  query: string
  commands: SlashCommandDescriptor[]
}>()

const emit = defineEmits<{
  select: [command: SlashCommandDescriptor]
  close: []
}>()

const { t } = useI18n()
const dropdownRef = ref<HTMLElement | null>(null)
const selectedIndex = ref(0)

const dropdownStyle = computed(() => {
  if (!props.position.x || !props.position.y) return {}

  const dropdownHeight = 280
  const showAbove = window.innerHeight - props.position.y < dropdownHeight

  if (showAbove) {
    return {
      left: `${props.position.x}px`,
      bottom: `${window.innerHeight - props.position.y + 20}px`
    }
  }

  return {
    left: `${props.position.x}px`,
    top: `${props.position.y + 4}px`
  }
})

const emptyLabel = computed(() => {
  if (props.query.trim()) {
    return t('message.slash.noMatch')
  }

  return t('message.slash.hint')
})

function close() {
  emit('close')
}

function select(command: SlashCommandDescriptor) {
  emit('select', command)
}

function scrollToSelected() {
  nextTick(() => {
    const selectedEl = dropdownRef.value?.querySelector('.slash-command__item--selected')
    selectedEl?.scrollIntoView({ block: 'nearest' })
  })
}

function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      event.stopPropagation()
      if (props.commands.length === 0) return
      selectedIndex.value = selectedIndex.value > 0 ? selectedIndex.value - 1 : props.commands.length - 1
      scrollToSelected()
      break
    case 'ArrowDown':
      event.preventDefault()
      event.stopPropagation()
      if (props.commands.length === 0) return
      selectedIndex.value = selectedIndex.value < props.commands.length - 1 ? selectedIndex.value + 1 : 0
      scrollToSelected()
      break
    case 'Enter': {
      const selectedCommand = props.commands[selectedIndex.value]
      if (!selectedCommand) return
      event.preventDefault()
      event.stopPropagation()
      select(selectedCommand)
      break
    }
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      close()
      break
  }
}

watch(() => props.commands, () => {
  selectedIndex.value = 0
  scrollToSelected()
}, { deep: true })

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dropdownRef"
      class="slash-command-dropdown"
      :style="dropdownStyle"
    >
      <div class="slash-command__header">
        <div class="slash-command__title">
          <EaIcon
            name="terminal-square"
            :size="14"
          />
          <span>{{ t('message.slash.title') }}</span>
        </div>
        <span class="slash-command__query">
          {{ query ? `/${query}` : '/' }}
        </span>
      </div>

      <div
        v-if="commands.length === 0"
        class="slash-command__empty"
      >
        <EaIcon
          name="search"
          :size="22"
        />
        <span>{{ emptyLabel }}</span>
      </div>

      <div
        v-else
        class="slash-command__list"
      >
        <button
          v-for="(command, index) in commands"
          :key="command.name"
          class="slash-command__item"
          :class="{ 'slash-command__item--selected': index === selectedIndex }"
          @mouseenter="selectedIndex = index"
          @click="select(command)"
        >
          <div class="slash-command__item-main">
            <span class="slash-command__item-name">/{{ command.name }}</span>
            <span class="slash-command__item-desc">{{ t(command.descriptionKey) }}</span>
          </div>
          <span class="slash-command__item-usage">{{ t(command.usageKey) }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.slash-command-dropdown {
  position: fixed;
  z-index: calc(var(--z-dropdown) + 2);
  width: min(420px, calc(100vw - 32px));
  border: 1px solid color-mix(in srgb, var(--color-border) 76%, rgba(15, 23, 42, 0.08));
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.95));
  box-shadow: 0 24px 44px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.slash-command__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: 14px 16px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
}

.slash-command__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.slash-command__query {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.slash-command__list {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
  padding: 8px;
}

.slash-command__item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  text-align: left;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.slash-command__item:hover,
.slash-command__item--selected {
  background: color-mix(in srgb, var(--color-primary-light) 58%, white);
}

.slash-command__item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.slash-command__item-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text-primary);
}

.slash-command__item-desc,
.slash-command__item-usage {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.slash-command__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 120px;
  color: var(--color-text-secondary);
}
</style>
