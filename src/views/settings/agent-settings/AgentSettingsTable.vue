<script setup lang="ts">
import { useAgentSettingsTable, type AgentSettingsTableProps, type AgentSettingsTableEmits } from './useAgentSettingsTable'

const props = defineProps<AgentSettingsTableProps>()
const emit = defineEmits<AgentSettingsTableEmits>()

const {
  EaButton,
  EaIcon,
  EaStateBlock,
  t,
  showPagination,
  getProviderIcon,
  getProviderText,
  formatDate,
  changePage
} = useAgentSettingsTable(props, emit)
</script>

<template>
  <div class="agent-settings-table">
    <div
      v-if="agents.length > 0"
      class="agent-table-container"
    >
      <table class="agent-table">
        <thead>
          <tr>
            <th class="agent-table__th agent-table__th--name">
              {{ t('settings.agentList.columnName') }}
            </th>
            <th class="agent-table__th agent-table__th--provider">
              {{ t('settings.agentList.columnProvider') }}
            </th>
            <th class="agent-table__th agent-table__th--model">
              {{ t('settings.agentList.columnModel') }}
            </th>
            <th class="agent-table__th agent-table__th--created">
              {{ t('settings.agentList.columnCreated') }}
            </th>
            <th class="agent-table__th agent-table__th--actions">
              {{ t('settings.agentList.columnActions') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="agent in agents"
            :key="agent.id"
            class="agent-table__row"
          >
            <td class="agent-table__td agent-table__td--name">
              <div class="agent-name-cell">
                <EaIcon
                  :name="getProviderIcon(agent.provider)"
                  :size="18"
                  class="agent-name-cell__icon"
                />
                <span class="agent-name-cell__text">{{ agent.name }}</span>
              </div>
            </td>
            <td class="agent-table__td agent-table__td--provider">
              <span class="provider-text">{{ getProviderText(agent.provider) }}</span>
            </td>
            <td class="agent-table__td agent-table__td--model">
              <div
                v-if="agent.modelId"
                class="model-cell"
              >
                <span class="model-cell__name">{{ agent.modelId }}</span>
                <span
                  v-if="agent.customModelEnabled"
                  class="model-cell__badge"
                >
                  {{ t('settings.agent.customModel') }}
                </span>
              </div>
              <span
                v-else
                class="model-cell--empty"
              >-</span>
            </td>
            <td class="agent-table__td agent-table__td--created">
              <span class="created-text">{{ formatDate(agent.createdAt) }}</span>
            </td>
            <td class="agent-table__td agent-table__td--actions">
              <div class="action-buttons">
                <EaButton
                  type="ghost"
                  size="small"
                  :loading="testingAgentId === agent.id"
                  @click="emit('test', agent.id)"
                >
                  <EaIcon
                    name="wifi"
                    :size="14"
                  />
                </EaButton>
                <EaButton
                  type="ghost"
                  size="small"
                  @click="emit('manageModels', agent)"
                >
                  <EaIcon
                    name="cpu"
                    :size="14"
                  />
                </EaButton>
                <EaButton
                  type="ghost"
                  size="small"
                  @click="emit('edit', agent)"
                >
                  <EaIcon
                    name="edit-2"
                    :size="14"
                  />
                </EaButton>
                <EaButton
                  type="ghost"
                  size="small"
                  class="action-buttons__delete"
                  @click="emit('delete', agent)"
                >
                  <EaIcon
                    name="trash-2"
                    :size="14"
                  />
                </EaButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EaStateBlock
      v-else
      class="agent-empty"
      icon="bot"
      :title="searchQuery ? t('settings.agentList.noMatchingAgents') : t('settings.agent.noAgents')"
      :description="t('settings.agent.noAgentsHint')"
    />

    <div
      v-if="showPagination"
      class="pagination"
    >
      <button
        class="pagination__btn"
        :disabled="currentPage === 1"
        @click="changePage(currentPage - 1)"
      >
        <EaIcon
          name="chevron-left"
          :size="16"
        />
      </button>

      <template
        v-for="(page, index) in pageNumbers"
        :key="index"
      >
        <span
          v-if="page === -1"
          class="pagination__ellipsis"
        >...</span>
        <button
          v-else
          :class="['pagination__btn', { 'pagination__btn--active': currentPage === page }]"
          @click="changePage(page)"
        >
          {{ page }}
        </button>
      </template>

      <button
        class="pagination__btn"
        :disabled="currentPage === totalPages"
        @click="changePage(currentPage + 1)"
      >
        <EaIcon
          name="chevron-right"
          :size="16"
        />
      </button>
    </div>
  </div>
</template>
<style scoped src="./AgentSettingsTable.css"></style>
