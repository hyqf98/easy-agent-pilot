<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore, type AppMode } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useAgentStore } from '@/stores/agent'
import { useAgentTeamsStore } from '@/stores/agentTeams'
import { resolveExpertRuntime } from '@/services/agentTeams/runtime'
import { EaIcon } from '@/components/common'

const uiStore = useUIStore()
const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const agentStore = useAgentStore()
const agentTeamsStore = useAgentTeamsStore()

const currentProjectName = computed(() => projectStore.currentProject?.name || 'No Repository')
const currentSessionName = computed(() => sessionStore.currentSession?.name || 'New Agent')

const modeItems: Array<{ mode: AppMode; label: string; icon: string }> = [
  { mode: 'chat', label: 'Agent', icon: 'bot' },
  { mode: 'plan', label: 'Plan', icon: 'clipboard-list' },
  { mode: 'solo', label: 'SOLO', icon: 'sparkles' },
  { mode: 'memory', label: 'Memory', icon: 'database' }
]

function setMode(mode: AppMode) {
  uiStore.setAppMode(mode)
  if (mode === 'chat') {
    uiStore.setMainContentMode('chat')
  }
}

async function handleCreateAgent() {
  const projectId = projectStore.currentProjectId || projectStore.projects[0]?.id
  if (!projectId) {
    uiStore.openProjectCreateModal()
    return
  }

  projectStore.setCurrentProject(projectId)
  await Promise.all([
    agentStore.loadAgents(),
    agentTeamsStore.loadExperts(true)
  ])

  const expert = agentTeamsStore.builtinGeneralExpert || agentTeamsStore.enabledExperts[0] || null
  const runtime = resolveExpertRuntime(expert, agentStore.agents)
  const session = await sessionStore.createSession({
    projectId,
    name: '',
    expertId: expert?.id,
    agentId: runtime?.agent.id,
    agentType: runtime?.agent.provider || runtime?.agent.type || 'claude',
    status: 'idle'
  })

  projectStore.incrementSessionCount(projectId)
  setMode('chat')
  await sessionStore.openSession(session.id)
}

</script>

<template>
  <header class="workspace-topbar">
    <div class="workspace-topbar__left">
      <button
        class="workspace-topbar__new-agent"
        type="button"
        @click="handleCreateAgent"
      >
        <EaIcon
          name="plus"
          :size="14"
        />
        <span>New Agent</span>
      </button>

      <div class="workspace-topbar__crumbs">
        <span class="workspace-topbar__project">{{ currentProjectName }}</span>
        <EaIcon
          name="chevron-right"
          :size="12"
        />
        <span class="workspace-topbar__session">{{ currentSessionName }}</span>
      </div>
    </div>

    <nav
      class="workspace-topbar__modes"
      aria-label="Workspace modes"
    >
      <button
        v-for="item in modeItems"
        :key="item.mode"
        type="button"
        class="workspace-topbar__mode"
        :class="{ 'workspace-topbar__mode--active': uiStore.appMode === item.mode }"
        :title="item.label"
        :aria-label="item.label"
        @click="setMode(item.mode)"
      >
        <EaIcon
          :name="item.icon"
          :size="14"
        />
        <span class="workspace-topbar__mode-label">{{ item.label }}</span>
      </button>
    </nav>

    <div class="workspace-topbar__right">
      <button
        class="workspace-topbar__icon"
        type="button"
        title="设置"
        @click="uiStore.openSettings()"
      >
        <EaIcon
          name="settings"
          :size="16"
        />
      </button>
    </div>
  </header>
</template>

<style scoped>
.workspace-topbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(160px, 1fr);
  align-items: center;
  gap: 10px;
  height: var(--workspace-topbar-height);
  padding: 0 10px;
  background: var(--workspace-topbar-bg);
  border-bottom: 1px solid var(--workspace-border);
  flex-shrink: 0;
}

.workspace-topbar__left,
.workspace-topbar__right,
.workspace-topbar__modes,
.workspace-topbar__crumbs,
.workspace-topbar__new-agent,
.workspace-topbar__mode,
.workspace-topbar__icon {
  display: inline-flex;
  align-items: center;
}

.workspace-topbar__left {
  justify-content: flex-start;
  min-width: 0;
  gap: 8px;
}

.workspace-topbar__right {
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.workspace-topbar__new-agent {
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--workspace-control-border);
  border-radius: 8px;
  background: var(--workspace-control-bg);
  color: var(--workspace-text-primary);
  font-size: 12px;
  font-weight: 500;
}

.workspace-topbar__new-agent:hover,
.workspace-topbar__mode:hover,
.workspace-topbar__icon:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.workspace-topbar__crumbs {
  min-width: 0;
  gap: 6px;
  color: var(--workspace-text-tertiary);
  font-size: 12px;
}

.workspace-topbar__project,
.workspace-topbar__session {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-topbar__project {
  max-width: 160px;
}

.workspace-topbar__session {
  max-width: 220px;
  color: var(--workspace-text-secondary);
}

.workspace-topbar__modes {
  justify-self: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--workspace-control-border);
  border-radius: 8px;
  background: var(--workspace-segment-bg);
}

.workspace-topbar__mode {
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  color: var(--workspace-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.workspace-topbar__mode-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.workspace-topbar__mode--active {
  background: var(--workspace-control-active-bg);
  color: var(--workspace-text-primary);
  box-shadow: var(--workspace-control-active-shadow);
}

.workspace-topbar__icon {
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--workspace-text-secondary);
}

@media (max-width: 1080px) {
  .workspace-topbar {
    grid-template-columns: minmax(180px, 1fr) auto auto;
  }

  .workspace-topbar__crumbs {
    display: none;
  }
}
</style>
