<script setup lang="ts">
import {
  useEaActionMenu,
  type EaActionMenuEmits,
  type EaActionMenuProps
} from './useEaActionMenu'

const props = withDefaults(defineProps<EaActionMenuProps>(), {
  items: () => [],
  triggerIcon: 'ellipsis-vertical',
  triggerLabel: '',
  align: 'right'
})
const emit = defineEmits<EaActionMenuEmits>()

const { rootRef, open, toggle, handleSelect, EaIcon } = useEaActionMenu(props, emit)
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

<style scoped src="./styles.css"></style>
