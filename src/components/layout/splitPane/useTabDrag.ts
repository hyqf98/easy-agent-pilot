import { reactive, readonly } from 'vue'

// 模块级共享拖拽态：跨分屏拖拽 tab 时，源 pane 与目标 pane 都能读到
interface TabDragState {
  active: boolean
  fromPaneId: string | null
  sessionId: string | null
}

const state = reactive<TabDragState>({
  active: false,
  fromPaneId: null,
  sessionId: null
})

export function useTabDrag() {
  function startTabDrag(fromPaneId: string, sessionId: string) {
    state.active = true
    state.fromPaneId = fromPaneId
    state.sessionId = sessionId
  }

  function endTabDrag() {
    state.active = false
    state.fromPaneId = null
    state.sessionId = null
  }

  return {
    dragState: readonly(state),
    startTabDrag,
    endTabDrag
  }
}
