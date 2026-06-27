import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import PaneWrapper from '../PaneWrapper/PaneWrapper.vue'
import { useSplitPaneStore, type DropZone } from '@/stores/splitPane'
import { useTabDrag } from '../useTabDrag'

export function useSplitContainer() {

interface PaneDropTarget {
  paneId: string
  zone: DropZone
}

interface DropTarget {
  row: number
  col: number
  position: 'before' | 'after' | 'new-row-below' | 'new-row'
}

type CellRole = 'normal' | 'dragging' | 'ghost'

interface GridCell {
  key: string
  role: CellRole
  paneId: string | null
}

interface DisplayRow {
  key: string
  cells: GridCell[]
}

const DRAG_Y_SPLIT = 0.5
// 拖拽 tab 时四边吸附阈值（距边占比）
const EDGE_THRESHOLD = 0.28

const { t } = useI18n()
const splitPaneStore = useSplitPaneStore()
const { dragState, endTabDrag } = useTabDrag()

const containerRef = ref<HTMLElement | null>(null)
const draggingPaneId = ref<string | null>(null)
const dropTarget = ref<DropTarget | null>(null)

// tab 跨分屏拖拽的放置目标
const tabDropTarget = ref<PaneDropTarget | null>(null)

let onMouseMove: ((e: MouseEvent) => void) | null = null
let onMouseUp: (() => void) | null = null
let rafId = 0
let pendingX = 0
let pendingY = 0
let hasPendingMove = false

const displayRows = computed<DisplayRow[]>(() => {
  const grid = splitPaneStore.paneGrid
  const pid = draggingPaneId.value
  const dt = dropTarget.value
  const isDragging = !!pid

  if (!isDragging || !dt) {
    return grid.map((row, r) => ({
      key: `row-${r}`,
      cells: row.map(id => ({ key: id, role: 'normal' as CellRole, paneId: id }))
    }))
  }

  const ghost: GridCell = { key: 'ghost', role: 'ghost', paneId: null }
  const sourceRows: GridCell[][] = []

  for (let r = 0; r < grid.length; r++) {
    const row: GridCell[] = []
    for (let c = 0; c < grid[r].length; c++) {
      const id = grid[r][c]
      row.push({
        key: id,
        role: id === pid ? 'dragging' : 'normal',
        paneId: id
      })
    }
    sourceRows.push(row)
  }

  if (dt.position === 'new-row') {
    sourceRows.push([ghost])
  } else if (dt.position === 'new-row-below') {
    const insertAt = Math.min(dt.row + 1, sourceRows.length)
    sourceRows.splice(insertAt, 0, [ghost])
  } else {
    const targetRow = sourceRows[dt.row]
    if (targetRow) {
      let insertCol = dt.position === 'after' ? Math.min(dt.col + 1, targetRow.length) : dt.col
      if (insertCol < 0) insertCol = 0
      targetRow.splice(insertCol, 0, ghost)
    }
  }

  return sourceRows
    .filter(row => row.length > 0)
    .map((row, r) => ({ key: `row-${r}`, cells: row }))
})

function onPaneClose(paneId: string) {
  splitPaneStore.removePane(paneId)
  if (splitPaneStore.paneCount <= 1) {
    splitPaneStore.exitSplitMode()
  }
}

function flushMove() {
  if (hasPendingMove) {
    hasPendingMove = false
    updateDropTarget(pendingX, pendingY)
  }
}

// ========== 整 pane 重排（mouse 事件）==========
function onPaneDragStart(paneId: string) {
  draggingPaneId.value = paneId
  dropTarget.value = null

  onMouseMove = (e: MouseEvent) => {
    if (!draggingPaneId.value) return
    pendingX = e.clientX
    pendingY = e.clientY
    if (!hasPendingMove) {
      hasPendingMove = true
      rafId = requestAnimationFrame(flushMove)
    }
  }

  onMouseUp = () => {
    finishDrag()
  }

  document.addEventListener('mousemove', onMouseMove, { passive: true })
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'grabbing'
}

function updateDropTarget(clientX: number, clientY: number) {
  const container = containerRef.value
  if (!container) return

  const allRows = container.querySelectorAll('.split-row')
  if (allRows.length === 0) return

  const grid = splitPaneStore.paneGrid

  const lastRowRect = allRows[allRows.length - 1].getBoundingClientRect()
  if (clientY > lastRowRect.bottom) {
    dropTarget.value = { row: grid.length, col: 0, position: 'new-row' }
    return
  }

  let hitRow = -1
  for (let r = 0; r < allRows.length; r++) {
    const rr = allRows[r].getBoundingClientRect()
    if (clientY >= rr.top && clientY <= rr.bottom) {
      hitRow = r
      break
    }
  }

  if (hitRow < 0) {
    dropTarget.value = null
    return
  }

  const rowWrappers = allRows[hitRow].querySelectorAll<HTMLElement>('.split-pane-wrapper')
  const paneCount = rowWrappers.length

  let hitCol = -1
  let hitRect: DOMRect | null = null

  for (let c = 0; c < paneCount; c++) {
    const pid = rowWrappers[c].dataset.paneId
    if (pid === draggingPaneId.value) continue
    const wr = rowWrappers[c].getBoundingClientRect()
    if (clientX >= wr.left && clientX <= wr.right) {
      hitCol = c
      hitRect = wr
      break
    }
  }

  if (hitCol < 0 && paneCount > 0) {
    const firstW = rowWrappers[0].getBoundingClientRect()
    const lastW = rowWrappers[paneCount - 1].getBoundingClientRect()
    if (clientX < firstW.left) {
      hitCol = 0
      hitRect = firstW
    } else if (clientX > lastW.right) {
      hitCol = paneCount - 1
      hitRect = lastW
    }
  }

  if (hitCol < 0 || !hitRect) {
    dropTarget.value = null
    return
  }

  const hitPaneId = rowWrappers[hitCol].dataset.paneId
  if (hitPaneId === draggingPaneId.value) {
    dropTarget.value = null
    return
  }

  const yRatio = (clientY - hitRect.top) / hitRect.height

  if (yRatio > DRAG_Y_SPLIT) {
    const srcPos = splitPaneStore.getPanePosition(draggingPaneId.value!)
    const isLastInRow = srcPos && srcPos.row === hitRow && srcPos.col === rowWrappers.length - 1
    if (isLastInRow && paneCount <= 1) {
      dropTarget.value = null
      return
    }
    const actualCol = parseInt(rowWrappers[hitCol].dataset.col || '0')
    dropTarget.value = { row: hitRow, col: actualCol, position: 'new-row-below' }
  } else {
    const midX = (hitRect.left + hitRect.right) / 2
    const pos = clientX < midX ? 'before' : 'after'
    const actualCol = parseInt(rowWrappers[hitCol].dataset.col || '0')
    dropTarget.value = { row: hitRow, col: actualCol, position: pos }
  }
}

function finishDrag() {
  cancelAnimationFrame(rafId)
  hasPendingMove = false
  if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
  if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  if (draggingPaneId.value && dropTarget.value) {
    const dt = dropTarget.value
    const pid = draggingPaneId.value
    const grid = splitPaneStore.paneGrid

    if (dt.position === 'new-row' || dt.position === 'new-row-below') {
      splitPaneStore.movePaneToNewRow(pid)
    } else if (dt.position === 'before') {
      const targetId = grid[dt.row]?.[dt.col]
      if (targetId && targetId !== pid) {
        splitPaneStore.movePaneBefore(pid, targetId)
      }
    } else if (dt.position === 'after') {
      const targetId = grid[dt.row]?.[dt.col]
      if (targetId && targetId !== pid) {
        splitPaneStore.movePaneAfter(pid, targetId)
      }
    }
  }

  draggingPaneId.value = null
  dropTarget.value = null
  onMouseMove = null
  onMouseUp = null
}

// ========== tab 跨分屏拖拽（document 级坐标命中，绕开子组件 stopPropagation）==========
function computeZone(rect: DOMRect, clientX: number, clientY: number): DropZone {
  const xRatio = (clientX - rect.left) / rect.width
  const yRatio = (clientY - rect.top) / rect.height

  const fromLeft = xRatio
  const fromRight = 1 - xRatio
  const fromTop = yRatio
  const fromBottom = 1 - yRatio

  const minEdge = Math.min(fromLeft, fromRight, fromTop, fromBottom)

  // 距边小于阈值 → 该方向吸附
  if (minEdge < EDGE_THRESHOLD) {
    if (fromLeft === minEdge) return 'left'
    if (fromRight === minEdge) return 'right'
    if (fromTop === minEdge) return 'top'
    return 'bottom'
  }
  return 'center'
}

// 用坐标命中找到光标下的 .split-pane-wrapper（跳过被吞事件的子组件）
function hitPaneAt(clientX: number, clientY: number): { el: HTMLElement; paneId: string } | null {
  const container = containerRef.value
  if (!container) return null
  // 在 split 容器范围内用 elementsFromPoint 找最近的 pane 包装元素
  const els = document.elementsFromPoint(clientX, clientY) as HTMLElement[]
  for (const el of els) {
    if (!container.contains(el)) continue
    const paneEl = el.closest('.split-pane-wrapper') as HTMLElement | null
    if (paneEl && paneEl.dataset.paneId) {
      return { el: paneEl, paneId: paneEl.dataset.paneId }
    }
  }
  return null
}

let onDocDragOver: ((e: DragEvent) => void) | null = null
let onDocDrop: ((e: DragEvent) => void) | null = null
let onDocDragEnd: (() => void) | null = null

function attachTabDragListeners() {
  if (onDocDragOver) return
  onDocDragOver = (e: DragEvent) => {
    if (!dragState.active) return
    const hit = hitPaneAt(e.clientX, e.clientY)
    if (!hit || hit.paneId === dragState.fromPaneId) {
      tabDropTarget.value = null
      return
    }
    // 必须 preventDefault 才能触发 drop
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    const rect = hit.el.getBoundingClientRect()
    const zone = computeZone(rect, e.clientX, e.clientY)
    tabDropTarget.value = { paneId: hit.paneId, zone }
  }

  onDocDrop = (e: DragEvent) => {
    if (!dragState.active) return
    e.preventDefault()
    e.stopPropagation()

    const fromPaneId = dragState.fromPaneId
    const sessionId = dragState.sessionId
    const hit = hitPaneAt(e.clientX, e.clientY)
    const toPaneId = hit?.paneId
    const zone = tabDropTarget.value?.zone ?? 'center'

    tabDropTarget.value = null
    endTabDrag()

    if (!fromPaneId || !sessionId || !toPaneId) return
    if (fromPaneId === toPaneId) return

    splitPaneStore.moveSessionToPane(fromPaneId, toPaneId, sessionId, zone)
  }

  // 兜底清理：拖拽取消/离开窗口时 dragend 仍会触发
  onDocDragEnd = () => {
    tabDropTarget.value = null
    endTabDrag()
  }

  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('drop', onDocDrop)
  document.addEventListener('dragend', onDocDragEnd)
}

function detachTabDragListeners() {
  if (onDocDragOver) document.removeEventListener('dragover', onDocDragOver)
  if (onDocDrop) document.removeEventListener('drop', onDocDrop)
  if (onDocDragEnd) document.removeEventListener('dragend', onDocDragEnd)
  onDocDragOver = null
  onDocDrop = null
  onDocDragEnd = null
  tabDropTarget.value = null
}

// 拖拽态激活/结束同步挂载/卸载 document 监听
watch(() => dragState.active, (active) => {
  if (active) {
    attachTabDragListeners()
  } else {
    detachTabDragListeners()
  }
})

onMounted(() => {
  if (dragState.active) {
    attachTabDragListeners()
  }
})

// tab 栏请求新增分屏组
function getTabDropZone(paneId: string): DropZone | null {
  if (!tabDropTarget.value) return null
  return tabDropTarget.value.paneId === paneId ? tabDropTarget.value.zone : null
}

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
  if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
  detachTabDragListeners()
})

  return {
    t,
    EaIcon,
    PaneWrapper,
    splitPaneStore,
    dragState,
    draggingPaneId,
    containerRef,
    displayRows,
    onPaneClose,
    onPaneDragStart,
    getTabDropZone,
  }
}
