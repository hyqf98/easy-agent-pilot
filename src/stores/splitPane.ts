/** 会话分屏（多 Pane 网格与拖拽布局）状态的 Pinia store。 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSessionStore } from './session'

export interface PaneInfo {
  id: string
  sessionIds: string[]
  activeSessionId: string | null
}

export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom'

let paneSeq = 0

export const useSplitPaneStore = defineStore('splitPane', () => {
  const activePanes = ref<PaneInfo[]>([])
  const paneGrid = ref<string[][]>([])
  const focusedPaneId = ref<string | null>(null)

  const isSplitActive = computed(() => activePanes.value.length > 1)

  const paneCount = computed(() => activePanes.value.length)

  const rowCount = computed(() => paneGrid.value.length)

  const focusedPane = computed(() =>
    activePanes.value.find(p => p.id === focusedPaneId.value) ?? null
  )

  function getPaneById(paneId: string): PaneInfo | undefined {
    return activePanes.value.find(p => p.id === paneId)
  }

  function getPanePosition(paneId: string): { row: number; col: number } | null {
    for (let r = 0; r < paneGrid.value.length; r++) {
      for (let c = 0; c < paneGrid.value[r].length; c++) {
        if (paneGrid.value[r][c] === paneId) {
          return { row: r, col: c }
        }
      }
    }
    return null
  }

  function createPane(sessionIds: string[]): PaneInfo {
    paneSeq++
    const active = sessionIds[0] ?? null
    return {
      id: `pane-${paneSeq}`,
      sessionIds: [...sessionIds],
      activeSessionId: active
    }
  }

  function addPane(sessionId: string): PaneInfo {
    const pane = createPane([sessionId])
    activePanes.value.push(pane)

    if (paneGrid.value.length === 0) {
      paneGrid.value.push([])
    }
    paneGrid.value[paneGrid.value.length - 1].push(pane.id)
    focusedPaneId.value = pane.id
    return pane
  }

  function addPaneToNewRow(sessionId: string): PaneInfo {
    const pane = createPane([sessionId])
    activePanes.value.push(pane)
    paneGrid.value.push([pane.id])
    focusedPaneId.value = pane.id
    return pane
  }

  function removePane(paneId: string) {
    const idx = activePanes.value.findIndex(p => p.id === paneId)
    if (idx < 0) return

    const removed = activePanes.value[idx]
    activePanes.value.splice(idx, 1)

    for (let r = 0; r < paneGrid.value.length; r++) {
      for (let c = paneGrid.value[r].length - 1; c >= 0; c--) {
        if (paneGrid.value[r][c] === paneId) {
          paneGrid.value[r].splice(c, 1)
          break
        }
      }
    }
    paneGrid.value = paneGrid.value.filter(row => row.length > 0)

    // 把被关闭 pane 的剩余 tab 合并到相邻 pane
    if (removed.sessionIds.length > 0 && activePanes.value.length > 0) {
      const neighborIdx = Math.min(idx, activePanes.value.length - 1)
      const neighbor = activePanes.value[neighborIdx]
      neighbor.sessionIds.push(...removed.sessionIds)
      if (!neighbor.activeSessionId) {
        neighbor.activeSessionId = removed.activeSessionId
      }
    }

    if (focusedPaneId.value === paneId) {
      if (activePanes.value.length > 1) {
        const nextIdx = Math.min(idx, activePanes.value.length - 1)
        focusedPaneId.value = activePanes.value[nextIdx].id
        syncCurrentSession()
      } else {
        // 只剩一个 pane，退出分屏
        exitSplitMode()
      }
    }
  }

  function movePaneToNewRow(paneId: string) {
    const pos = getPanePosition(paneId)
    if (!pos) return
    paneGrid.value[pos.row].splice(pos.col, 1)
    if (paneGrid.value[pos.row].length === 0) {
      paneGrid.value.splice(pos.row, 1)
    }
    paneGrid.value.push([paneId])
    paneGrid.value = paneGrid.value.filter(row => row.length > 0)
    focusedPaneId.value = paneId
  }

  function movePaneBefore(targetPaneId: string, beforePaneId: string) {
    if (targetPaneId === beforePaneId) return
    const srcPos = getPanePosition(targetPaneId)
    if (!srcPos) return
    paneGrid.value[srcPos.row].splice(srcPos.col, 1)

    const destPos = getPanePosition(beforePaneId)
    if (!destPos) {
      if (paneGrid.value[srcPos.row].length === 0) {
        paneGrid.value.splice(srcPos.row, 1)
      }
      paneGrid.value.push([targetPaneId])
      focusedPaneId.value = targetPaneId
      return
    }

    let insertCol = destPos.col
    if (srcPos.row === destPos.row && srcPos.col < destPos.col) {
      insertCol = destPos.col - 1
    }

    if (paneGrid.value[srcPos.row].length === 0) {
      paneGrid.value.splice(srcPos.row, 1)
      if (srcPos.row < destPos.row) {
        destPos.row--
      }
    }
    paneGrid.value[destPos.row].splice(insertCol, 0, targetPaneId)
    paneGrid.value = paneGrid.value.filter(row => row.length > 0)
    focusedPaneId.value = targetPaneId
  }

  function movePaneAfter(targetPaneId: string, afterPaneId: string) {
    if (targetPaneId === afterPaneId) return
    const srcPos = getPanePosition(targetPaneId)
    if (!srcPos) return
    paneGrid.value[srcPos.row].splice(srcPos.col, 1)

    const destPos = getPanePosition(afterPaneId)
    if (!destPos) {
      if (paneGrid.value[srcPos.row].length === 0) {
        paneGrid.value.splice(srcPos.row, 1)
      }
      paneGrid.value.push([targetPaneId])
      focusedPaneId.value = targetPaneId
      return
    }

    let insertCol = destPos.col + 1
    if (srcPos.row === destPos.row && srcPos.col <= destPos.col) {
      insertCol = destPos.col
    }

    if (paneGrid.value[srcPos.row].length === 0) {
      paneGrid.value.splice(srcPos.row, 1)
      if (srcPos.row < destPos.row) {
        destPos.row--
      }
    }
    paneGrid.value[destPos.row].splice(insertCol, 0, targetPaneId)
    paneGrid.value = paneGrid.value.filter(row => row.length > 0)
    focusedPaneId.value = targetPaneId
  }

  function syncCurrentSession() {
    const focused = focusedPane.value
    if (focused?.activeSessionId) {
      const sessionStore = useSessionStore()
      sessionStore.setCurrentSession(focused.activeSessionId)
    }
  }

  function focusPane(paneId: string) {
    const pane = getPaneById(paneId)
    if (pane) {
      focusedPaneId.value = paneId
      syncCurrentSession()
    }
  }

  function setActiveSessionInPane(paneId: string, sessionId: string) {
    const pane = getPaneById(paneId)
    if (!pane || !pane.sessionIds.includes(sessionId)) return
    pane.activeSessionId = sessionId
    if (paneId === focusedPaneId.value) {
      syncCurrentSession()
    }
  }

  function addSessionToPane(paneId: string, sessionId: string) {
    const pane = getPaneById(paneId)
    if (!pane) return
    if (!pane.sessionIds.includes(sessionId)) {
      pane.sessionIds.push(sessionId)
    }
    pane.activeSessionId = sessionId
    focusedPaneId.value = paneId
    syncCurrentSession()
  }

  function removeSessionFromPane(paneId: string, sessionId: string) {
    const pane = getPaneById(paneId)
    if (!pane) return
    const idx = pane.sessionIds.indexOf(sessionId)
    if (idx < 0) return

    pane.sessionIds.splice(idx, 1)

    if (pane.activeSessionId === sessionId) {
      pane.activeSessionId = pane.sessionIds[0] ?? null
    }

    // pane 空了就移除 pane
    if (pane.sessionIds.length === 0) {
      removePane(paneId)
      return
    }

    if (paneId === focusedPaneId.value) {
      syncCurrentSession()
    }
  }

  // 兼容旧接口：更新 pane 的唯一/活动会话
  function updatePaneSession(paneId: string, sessionId: string) {
    addSessionToPane(paneId, sessionId)
  }

  // 兼容旧接口：返回 pane 活动会话
  function getPaneSessionId(paneId: string): string {
    return getPaneById(paneId)?.activeSessionId ?? ''
  }

  // 从源 pane 拖动一个会话到目标 pane 的指定区域
  // center: 并入目标 pane 的 tab
  // left/right: 新建 pane 放到目标同行左/右
  // top/bottom: 新建 pane 放到目标上/下新行
  function moveSessionToPane(
    fromPaneId: string,
    toPaneId: string,
    sessionId: string,
    zone: DropZone
  ) {
    const fromPane = getPaneById(fromPaneId)
    const toPane = getPaneById(toPaneId)
    if (!fromPane || !toPane) return

    // 先从源 pane 摘除会话
    const sIdx = fromPane.sessionIds.indexOf(sessionId)
    if (sIdx < 0) return
    fromPane.sessionIds.splice(sIdx, 1)
    const wasActive = fromPane.activeSessionId === sessionId

    if (zone === 'center') {
      // 并入目标 pane
      if (!toPane.sessionIds.includes(sessionId)) {
        toPane.sessionIds.push(sessionId)
      }
      toPane.activeSessionId = sessionId
      focusedPaneId.value = toPaneId
    } else {
      const newPane = createPane([sessionId])
      activePanes.value.push(newPane)
      const toPos = getPanePosition(toPaneId)
      if (!toPos) return

      if (zone === 'top') {
        paneGrid.value.splice(toPos.row, 0, [newPane.id])
      } else if (zone === 'bottom') {
        paneGrid.value.splice(toPos.row + 1, 0, [newPane.id])
      } else if (zone === 'left') {
        paneGrid.value[toPos.row].splice(toPos.col, 0, newPane.id)
      } else if (zone === 'right') {
        paneGrid.value[toPos.row].splice(toPos.col + 1, 0, newPane.id)
      }
      focusedPaneId.value = newPane.id
    }

    // 处理源 pane：若被摘除的是活动会话则重置
    if (wasActive) {
      fromPane.activeSessionId = fromPane.sessionIds[0] ?? null
    }

    // 源 pane 空了就移除
    if (fromPane.sessionIds.length === 0) {
      const fromId = fromPane.id
      const fIdx = activePanes.value.findIndex(p => p.id === fromId)
      activePanes.value = activePanes.value.filter(p => p.id !== fromId)
      for (let r = 0; r < paneGrid.value.length; r++) {
        paneGrid.value[r] = paneGrid.value[r].filter(id => id !== fromId)
      }
      paneGrid.value = paneGrid.value.filter(row => row.length > 0)
      void fIdx
      if (activePanes.value.length <= 1) {
        exitSplitMode()
        return
      }
    }

    paneGrid.value = paneGrid.value.filter(row => row.length > 0)
    syncCurrentSession()
  }

  function exitSplitMode() {
    const focused = focusedPane.value
    if (focused?.activeSessionId) {
      const sessionStore = useSessionStore()
      sessionStore.setCurrentSession(focused.activeSessionId)
    }
    activePanes.value = []
    paneGrid.value = []
    focusedPaneId.value = null
  }

  function enterSplitMode(sessionId: string, secondSessionId?: string) {
    const sessionStore = useSessionStore()
    const s1 = secondSessionId
      ? sessionId
      : (sessionStore.currentSessionId ?? sessionId)
    const s2 = secondSessionId ?? sessionId

    activePanes.value = []
    paneGrid.value = []

    addPane(s1)
    addPane(s2)
  }

  return {
    activePanes,
    paneGrid,
    focusedPaneId,
    isSplitActive,
    paneCount,
    rowCount,
    focusedPane,
    getPaneById,
    getPanePosition,
    getPaneSessionId,
    addPane,
    addPaneToNewRow,
    removePane,
    movePaneToNewRow,
    movePaneBefore,
    movePaneAfter,
    focusPane,
    setActiveSessionInPane,
    addSessionToPane,
    removeSessionFromPane,
    moveSessionToPane,
    updatePaneSession,
    exitSplitMode,
    enterSplitMode
  }
})
