<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore, type AgentConfig } from '@/stores/agent'
import { EaIcon } from '@/components/common'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'

const props = defineProps<{
  modelValue: AgentConfig | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AgentConfig | null): void
}>()

const { t } = useI18n()
const agentStore = useAgentStore()

// 下拉菜单展开状态
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// 分组智能体
const cliAgents = computed(() =>
  agentStore.agents.filter(a => a.acpCommand || a.cliPath)
)

const sdkAgents = computed(() =>
  agentStore.agents.filter(a => !a.acpCommand && !a.cliPath)
)

const noAgents = computed(() => agentStore.agents.length === 0)

// 监听智能体列表变化，自动选择第一个
watch(() => agentStore.agents, (agents) => {
  if (agents.length > 0 && !props.modelValue) {
    emit('update:modelValue', agents[0])
  }
}, { immediate: true })

// 切换下拉菜单
function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectAgent(agent: AgentConfig) {
  emit('update:modelValue', agent)
  isOpen.value = false
}

useSafeOutsideClick(
  () => [dropdownRef.value],
  () => {
    isOpen.value = false
  }
)

function getAgentIcon(_type: string) {
  return 'lucide:terminal'
}

function getAgentTypeLabel(_type: string) {
  return 'ACP'
}
</script>

<template>
  <div class="agent-selector">
    <div class="agent-selector__label">
      {{ t('settings.agentConfig.selectAgent') }}
    </div>

    <div
      ref="dropdownRef"
      class="agent-selector__dropdown"
      :class="{ 'agent-selector__dropdown--open': isOpen }"
    >
      <div
        class="agent-selector__current"
        :class="{ 'agent-selector__current--placeholder': !modelValue }"
        @click="toggleDropdown"
      >
        <template v-if="modelValue">
          <EaIcon
            :name="getAgentIcon(modelValue.type)"
            class="agent-selector__icon"
          />
          <span class="agent-selector__name">{{ modelValue.name }}</span>
          <span class="agent-selector__type">{{ getAgentTypeLabel(modelValue.type) }}</span>
        </template>
        <template v-else>
          <span class="agent-selector__placeholder">{{ t('settings.agentConfig.selectAgentPlaceholder') }}</span>
        </template>
        <EaIcon
          name="lucide:chevron-down"
          class="agent-selector__chevron"
        />
      </div>

      <div class="agent-selector__menu">
        <!-- CLI 类型智能体 -->
        <div
          v-if="cliAgents.length > 0"
          class="agent-selector__group"
        >
          <div class="agent-selector__group-label">
            {{ t('settings.agentConfig.cliAgents') }}
          </div>
          <div
            v-for="agent in cliAgents"
            :key="agent.id"
            class="agent-selector__option"
            :class="{ 'agent-selector__option--active': modelValue?.id === agent.id }"
            @click="selectAgent(agent)"
          >
            <EaIcon
              :name="getAgentIcon(agent.type)"
              class="agent-selector__option-icon"
            />
            <span class="agent-selector__option-name">{{ agent.name }}</span>
            <span class="agent-selector__option-provider">{{ agent.provider }}</span>
          </div>
        </div>

        <!-- SDK 类型智能体 -->
        <div
          v-if="sdkAgents.length > 0"
          class="agent-selector__group"
        >
          <div class="agent-selector__group-label">
            {{ t('settings.agentConfig.sdkAgents') }}
          </div>
          <div
            v-for="agent in sdkAgents"
            :key="agent.id"
            class="agent-selector__option"
            :class="{ 'agent-selector__option--active': modelValue?.id === agent.id }"
            @click="selectAgent(agent)"
          >
            <EaIcon
              :name="getAgentIcon(agent.type)"
              class="agent-selector__option-icon"
            />
            <span class="agent-selector__option-name">{{ agent.name }}</span>
            <span class="agent-selector__option-provider">{{ agent.provider }}</span>
          </div>
        </div>

        <!-- 无智能体提示 -->
        <div
          v-if="noAgents"
          class="agent-selector__empty"
        >
          <EaIcon
            name="lucide:inbox"
            class="agent-selector__empty-icon"
          />
          <span>{{ t('settings.agentConfig.noAgents') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./AgentSelector.css"></style>
