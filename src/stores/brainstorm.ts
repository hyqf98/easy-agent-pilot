import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type {
  BrainstormMode,
  BrainstormState,
  BrainstormTodo,
  BrainstormTodoOp,
  PendingBrainstormForm
} from '@/types/brainstorm'

interface RustBrainstormState {
  session_id: string
  mode: BrainstormMode
  context: Record<string, unknown>
  updated_at: string
}

interface RustBrainstormTodo {
  id: string
  session_id: string
  title: string
  description?: string
  status: BrainstormTodo['status']
  order: number
  source_message_id?: string
  created_at: string
  updated_at: string
}

interface RustApplyResult {
  changed_count: number
  todos: RustBrainstormTodo[]
}

function transformState(raw: RustBrainstormState): BrainstormState {
  return {
    sessionId: raw.session_id,
    mode: raw.mode,
    context: raw.context || {},
    updatedAt: raw.updated_at
  }
}

function transformTodo(raw: RustBrainstormTodo): BrainstormTodo {
  return {
    id: raw.id,
    sessionId: raw.session_id,
    title: raw.title,
    description: raw.description,
    status: raw.status,
    order: raw.order,
    sourceMessageId: raw.source_message_id,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at
  }
}

export const useBrainstormStore = defineStore('brainstorm', () => {
  const modeBySession = ref<Record<string, BrainstormMode>>({})
  const contextBySession = ref<Record<string, Record<string, unknown>>>({})
  const todosBySession = ref<Record<string, BrainstormTodo[]>>({})
  const pendingFormBySession = ref<Record<string, PendingBrainstormForm | null>>({})
  const loadedBySession = ref<Record<string, boolean>>({})

  function getSessionMode(sessionId: string): BrainstormMode {
    return modeBySession.value[sessionId] ?? 'normal'
  }

  function getSessionContext(sessionId: string): Record<string, unknown> {
    return contextBySession.value[sessionId] ?? {}
  }

  function getSessionTodos(sessionId: string): BrainstormTodo[] {
    return todosBySession.value[sessionId] ?? []
  }

  function getPendingForm(sessionId: string): PendingBrainstormForm | null {
    return pendingFormBySession.value[sessionId] ?? null
  }

  function setPendingForm(sessionId: string, form: PendingBrainstormForm | null): void {
    pendingFormBySession.value = {
      ...pendingFormBySession.value,
      [sessionId]: form
    }
  }

  function clearSessionCache(sessionId: string): void {
    const nextModes = { ...modeBySession.value }
    const nextContexts = { ...contextBySession.value }
    const nextTodos = { ...todosBySession.value }
    const nextForms = { ...pendingFormBySession.value }
    const nextLoaded = { ...loadedBySession.value }

    delete nextModes[sessionId]
    delete nextContexts[sessionId]
    delete nextTodos[sessionId]
    delete nextForms[sessionId]
    delete nextLoaded[sessionId]

    modeBySession.value = nextModes
    contextBySession.value = nextContexts
    todosBySession.value = nextTodos
    pendingFormBySession.value = nextForms
    loadedBySession.value = nextLoaded
  }

  async function loadSession(sessionId: string): Promise<void> {
    const [rawState, rawTodos] = await Promise.all([
      invoke<RustBrainstormState>('get_session_brainstorm_state', { sessionId }),
      invoke<RustBrainstormTodo[]>('list_session_brainstorm_todos', { sessionId })
    ])

    const state = transformState(rawState)

    modeBySession.value = {
      ...modeBySession.value,
      [sessionId]: state.mode
    }
    contextBySession.value = {
      ...contextBySession.value,
      [sessionId]: state.context
    }
    todosBySession.value = {
      ...todosBySession.value,
      [sessionId]: rawTodos.map(transformTodo)
    }
    loadedBySession.value = {
      ...loadedBySession.value,
      [sessionId]: true
    }
  }

  async function ensureSessionLoaded(sessionId: string): Promise<void> {
    if (!sessionId) return
    if (loadedBySession.value[sessionId]) return
    await loadSession(sessionId)
  }

  async function setSessionMode(sessionId: string, mode: BrainstormMode): Promise<BrainstormState> {
    const raw = await invoke<RustBrainstormState>('set_session_brainstorm_mode', {
      sessionId,
      mode
    })

    const state = transformState(raw)
    modeBySession.value = {
      ...modeBySession.value,
      [sessionId]: state.mode
    }
    contextBySession.value = {
      ...contextBySession.value,
      [sessionId]: state.context
    }

    if (mode === 'normal') {
      setPendingForm(sessionId, null)
    }

    return state
  }

  async function setSessionContext(
    sessionId: string,
    context: Record<string, unknown>
  ): Promise<BrainstormState> {
    const raw = await invoke<RustBrainstormState>('set_session_brainstorm_context', {
      sessionId,
      context
    })

    const state = transformState(raw)
    contextBySession.value = {
      ...contextBySession.value,
      [sessionId]: state.context
    }
    modeBySession.value = {
      ...modeBySession.value,
      [sessionId]: state.mode
    }

    return state
  }

  async function patchSessionContext(
    sessionId: string,
    patch: Record<string, unknown>
  ): Promise<BrainstormState> {
    const merged = {
      ...getSessionContext(sessionId),
      ...patch
    }

    return setSessionContext(sessionId, merged)
  }

  async function applyTodoOps(
    sessionId: string,
    ops: BrainstormTodoOp[],
    sourceMessageId?: string
  ): Promise<{ changedCount: number; todos: BrainstormTodo[] }> {
    const raw = await invoke<RustApplyResult>('apply_session_brainstorm_todo_ops', {
      sessionId,
      ops,
      sourceMessageId: sourceMessageId ?? null
    })

    const todos = raw.todos.map(transformTodo)
    todosBySession.value = {
      ...todosBySession.value,
      [sessionId]: todos
    }

    return {
      changedCount: raw.changed_count,
      todos
    }
  }

  return {
    modeBySession,
    contextBySession,
    todosBySession,
    pendingFormBySession,
    loadedBySession,
    getSessionMode,
    getSessionContext,
    getSessionTodos,
    getPendingForm,
    setPendingForm,
    clearSessionCache,
    loadSession,
    ensureSessionLoaded,
    setSessionMode,
    setSessionContext,
    patchSessionContext,
    applyTodoOps
  }
})
