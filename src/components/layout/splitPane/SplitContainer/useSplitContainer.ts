/** useSplitContainer — SplitContainer 分屏容器组件的 composable，负责窗格布局、拖拽放置区与跨窗格 tab 拖拽编排。 */
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
    // row 表示插入位置：grid.length = 追加底部；0 = 插入顶部
    const insertAt = Math.min(dt.row, sourceRows.length)
    sourceRows.splice(insertAt, 0, [ghost])
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

// 拖拽开始时快照所有 row 的 rect（含 ghost 前的稳定布局），
// 避免 ghost 插入/移除导致 rect 抖动 → dropTarget 反复翻转 → 闪烁。
interface RowSnapshot {
  top: number
  bottom: number
  left: number
  right: number
  panes: { paneId: string; col: number; left: number; right: number; top: number; bottom: number }[]
}
let rowSnapshots: RowSnapshot[] = []

function snapshotRows() {
  const container = containerRef.value
  if (!container) {
    rowSnapshots = []
    return
  }
  const allRows = container.querySelectorAll('.split-row')
  rowSnapshots = []
  for (let r = 0; r < allRows.length; r++) {
    const rowEl = allRows[r] as HTMLElement
    const rowRect = rowEl.getBoundingClientRect()
    const wrappers = rowEl.querySelectorAll<HTMLElement>('.split-pane-wrapper')
    const panes: RowSnapshot['panes'] = []
    // 用 grid 列号映射（跳过被拖拽的 pane，但不影响 col 对齐：仍按 DOM 顺序取 col）
    let visibleCol = 0
    for (let c = 0; c < wrappers.length; c++) {
      const wEl = wrappers[c]
      const pid = wEl.dataset.paneId
      if (!pid) continue
      const wr = wEl.getBoundingClientRect()
      panes.push({
        paneId: pid,
        col: visibleCol,
        left: wr.left,
        right: wr.right,
        top: wr.top,
        bottom: wr.bottom
      })
      visibleCol++
    }
    rowSnapshots.push({
      top: rowRect.top,
      bottom: rowRect.bottom,
      left: rowRect.left,
      right: rowRect.right,
      panes
    })
  }
}

function onPaneDragStart(paneId: string) {
  draggingPaneId.value = paneId
  dropTarget.value = null
  // 在 ghost 插入前快照稳定布局，后续命中判断一律基于此快照
  snapshotRows()

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

// 四边吸附阈值（基于快照 rect 的占比）
const PANE_EDGE_THRESHOLD = 0.3

function updateDropTarget(clientX: number, clientY: number) {
  if (rowSnapshots.length === 0) return

  const grid = splitPaneStore.paneGrid
  const lastSnap = rowSnapshots[rowSnapshots.length - 1]

  // 鼠标在最后一行下方 → 新增一行（水平方向上不区分，整行）
  if (clientY > lastSnap.bottom) {
    dropTarget.value = { row: grid.length, col: 0, position: 'new-row' }
    return
  }

  // 鼠标在第一行上方 → 在最顶新增一行
  if (clientY < rowSnapshots[0].top) {
    dropTarget.value = { row: 0, col: 0, position: 'new-row' }
    return
  }

  // 命中哪一行（基于快照，不抖动）
  let hitRow = -1
  for (let r = 0; r < rowSnapshots.length; r++) {
    const snap = rowSnapshots[r]
    if (clientY >= snap.top && clientY <= snap.bottom) {
      hitRow = r
      break
    }
  }
  if (hitRow < 0) {
    dropTarget.value = null
    return
  }

  const snap = rowSnapshots[hitRow]
  const otherPanes = snap.panes.filter(p => p.paneId !== draggingPaneId.value)
  if (otherPanes.length === 0) {
    dropTarget.value = null
    return
  }

  // 命中哪个 pane（X 轴）
  let hitPane = otherPanes.find(p => clientX >= p.left && clientX <= p.right)
  if (!hitPane) {
    // 超出行宽：吸附到最近端
    const first = otherPanes[0]
    const last = otherPanes[otherPanes.length - 1]
    if (clientX < first.left) hitPane = first
    else if (clientX > last.right) hitPane = last
    else hitPane = otherPanes.reduce((acc, p) => {
      const dAcc = Math.min(Math.abs(clientX - acc.left), Math.abs(clientX - acc.right))
      const dP = Math.min(Math.abs(clientX - p.left), Math.abs(clientX - p.right))
      return dP < dAcc ? p : acc
    }, otherPanes[0])
  }
  if (!hitPane) {
    dropTarget.value = null
    return
  }

  // 四边吸附：基于命中 pane 的占比判断上/下/左/右/中心
  const xRatio = (clientX - hitPane.left) / (hitPane.right - hitPane.left)
  const yRatio = (clientY - hitPane.top) / (hitPane.bottom - hitPane.top)
  const fromLeft = xRatio
  const fromRight = 1 - xRatio
  const fromTop = yRatio
  const fromBottom = 1 - yRatio
  const minEdge = Math.min(fromLeft, fromRight, fromTop, fromBottom)

  if (minEdge < PANE_EDGE_THRESHOLD) {
    if (fromTop === minEdge) {
      // 顶部吸附：在当前 pane 上方插入（同行前/或新行取决于行内 pane 数）
      dropTarget.value = { row: hitRow, col: hitPane.col, position: 'before' }
    } else if (fromBottom === minEdge) {
      // 底部吸附：当前 pane 下方 → 默认在右侧新增（水平分配），让底部也能左右分配
      dropTarget.value = { row: hitRow, col: hitPane.col, position: 'after' }
    } else if (fromLeft === minEdge) {
      dropTarget.value = { row: hitRow, col: hitPane.col, position: 'before' }
    } else {
      dropTarget.value = { row: hitRow, col: hitPane.col, position: 'after' }
    }
  } else {
    // 中心区：在同行 pane 之间按 X 中线决定 before/after
    const midX = (hitPane.left + hitPane.right) / 2
    dropTarget.value = {
      row: hitRow,
      col: hitPane.col,
      position: clientX < midX ? 'before' : 'after'
    }
  }
}

function finishDrag() {
  cancelAnimationFrame(rafId)
  hasPendingMove = false
  if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
  if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  // 清理快照，避免下次拖拽误用旧布局
  rowSnapshots = []

  if (draggingPaneId.value && dropTarget.value) {
    const dt = dropTarget.value
    const pid = draggingPaneId.value
    const grid = splitPaneStore.paneGrid

    if (dt.position === 'new-row') {
      // dt.row 为 0 表示插入顶部，grid.length 表示追加底部
      splitPaneStore.movePaneToNewRowAt(pid, dt.row)
    } else if (dt.position === 'new-row-below') {
      splitPaneStore.movePaneToNewRowAt(pid, dt.row + 1)
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
// 拖拽 tab 时四边吸附阈值（距边占比）
const EDGE_THRESHOLD = 0.28

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
