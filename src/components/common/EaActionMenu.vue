<script setup lang="ts">
/**
 * EaActionMenu - 轻量操作菜单（溢出/更多按钮）
 * 点击触发按钮展开菜单，点击菜单项或外部区域关闭。样式全部走设计 token。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import EaIcon from './EaIcon.vue'

export interface ActionMenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
}

withDefaults(defineProps<{
  items?: ActionMenuItem[]
  triggerIcon?: string
  triggerLabel?: string
  /** 对齐方向，默认右对齐（菜单靠右） */
  align?: 'left' | 'right'
}>(), {
  items: () => [],
  triggerIcon: 'ellipsis-vertical',
  triggerLabel: '',
  align: 'right'
})

const emit = defineEmits<{
  select: [key: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)

function handleDocumentClick(event: MouseEvent) {
  if (!open.value || !rootRef.value) {
    return
  }
  if (!rootRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeydown)
})

function toggle(event: Event) {
  event.stopPropagation()
  open.value = !open.value
}

function handleSelect(item: ActionMenuItem) {
  if (item.disabled) {
    return
  }
  open.value = false
  emit('select', item.key)
}
</script>

<template>
  <div
    ref="rootRef"
    class="ea-action-menu"
    :class="[`ea-action-menu--${align}`]"
  >
    <button
      type="button"
      class="ea-action-menu__trigger"
      :class="{ 'ea-action-menu__trigger--active': open }"
      :aria-expanded="open"
      @click="toggle"
    >
      <EaIcon
        v-if="triggerIcon && !triggerLabel"
        :name="triggerIcon"
        :size="16"
      />
      <template v-else>
        <EaIcon
          v-if="triggerIcon"
          :name="triggerIcon"
          :size="14"
        />
        <span v-if="triggerLabel">{{ triggerLabel }}</span>
      </template>
    </button>

    <Transition name="ea-action-menu">
      <div
        v-if="open"
        class="ea-action-menu__popover"
      >
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          class="ea-action-menu__item"
          :class="{ 'ea-action-menu__item--danger': item.danger, 'ea-action-menu__item--disabled': item.disabled }"
          :disabled="item.disabled"
          @click="handleSelect(item)"
        >
          <EaIcon
            v-if="item.icon"
            :name="item.icon"
            :size="14"
          />
          <span>{{ item.label }}</span>
        </button>
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ea-action-menu {
  position: relative;
  display: inline-flex;
}

.ea-action-menu__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-1);
  height: var(--button-height, 36px);
  min-width: var(--button-height, 36px);
  padding: 0 var(--spacing-2);
  border: 1px solid var(--workspace-control-border, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--workspace-control-bg, var(--color-surface));
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}

.ea-action-menu__trigger:hover {
  background: var(--workspace-control-hover-bg, var(--color-surface-hover));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.ea-action-menu__trigger--active {
  background: var(--workspace-control-hover-bg, var(--color-surface-active));
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.ea-action-menu__popover {
  position: absolute;
  top: calc(100% + 6px);
  min-width: 168px;
  padding: var(--spacing-1);
  background: var(--workspace-panel-bg, var(--color-surface));
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
  z-index: var(--z-dropdown, 1000);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ea-action-menu--right .ea-action-menu__popover {
  right: 0;
}

.ea-action-menu--left .ea-action-menu__popover {
  left: 0;
}

.ea-action-menu__item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--workspace-text-primary, var(--color-text-primary));
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.ea-action-menu__item:hover:not(.ea-action-menu__item--disabled) {
  background: var(--workspace-list-hover-bg, var(--color-surface-hover));
}

.ea-action-menu__item--danger {
  color: var(--color-error);
}

.ea-action-menu__item--danger:hover:not(.ea-action-menu__item--disabled) {
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}

.ea-action-menu__item--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 进出动画 */
.ea-action-menu-enter-active,
.ea-action-menu-leave-active {
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  transform-origin: top right;
}

.ea-action-menu--left .ea-action-menu-enter-active,
.ea-action-menu--left .ea-action-menu-leave-active {
  transform-origin: top left;
}

.ea-action-menu-enter-from,
.ea-action-menu-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
