import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { FileEditChangeType, FileEditRange } from '@/types/fileTrace'

export interface TraceDiffStackProps {
beforeContent: string
  afterContent: string
  changeType: FileEditChangeType
  focusRange?: FileEditRange | null
  rolledBack?: boolean
}

export interface TraceDiffStackEmits {
  (event: 'acceptLeft'): void
  (event: 'acceptRight'): void
}

export function useTraceDiffStack(props: TraceDiffStackProps, emit: TraceDiffStackEmits) {

type DiffOpType = 'equal' | 'remove' | 'add'

interface DiffOp {
  type: DiffOpType
  text: string
}

interface SideRow {
  lineNumber: number | null
  text: string
  variant: 'neutral' | 'changed'
}

const { t } = useI18n()
const beforeScrollRef = ref<HTMLElement | null>(null)
const afterScrollRef = ref<HTMLElement | null>(null)
const gutterScrollRef = ref<HTMLElement | null>(null)
const activeChangeIndex = ref(-1)

function normalizeLines(content: string): string[] {
  if (!content) return []
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function buildDiffOps(beforeLines: string[], afterLines: string[]): DiffOp[] {
  const dp = Array.from({ length: beforeLines.length + 1 }, () =>
    Array<number>(afterLines.length + 1).fill(0)
  )
  for (let i = beforeLines.length - 1; i >= 0; i--) {
    for (let j = afterLines.length - 1; j >= 0; j--) {
      if (beforeLines[i] === afterLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      ops.push({ type: 'equal', text: beforeLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', text: beforeLines[i] })
      i++
    } else {
      ops.push({ type: 'add', text: afterLines[j] })
      j++
    }
  }
  while (i < beforeLines.length) {
    ops.push({ type: 'remove', text: beforeLines[i] })
    i++
  }
  while (j < afterLines.length) {
    ops.push({ type: 'add', text: afterLines[j] })
    j++
  }
  return ops
}

interface PairRow {
  before: SideRow
  after: SideRow
  isChanged: boolean
}

function buildPairRows(ops: DiffOp[]): PairRow[] {
  const rows: PairRow[] = []
  let bLine = 1
  let aLine = 1

  let idx = 0
  while (idx < ops.length) {
    const op = ops[idx]
    if (op.type === 'equal') {
      rows.push({
        before: { lineNumber: bLine++, text: op.text, variant: 'neutral' },
        after: { lineNumber: aLine++, text: op.text, variant: 'neutral' },
        isChanged: false
      })
      idx++
    } else {
      const removes: string[] = []
      const adds: string[] = []
      while (idx < ops.length && ops[idx].type === 'remove') {
        removes.push(ops[idx].text)
        idx++
      }
      while (idx < ops.length && ops[idx].type === 'add') {
        adds.push(ops[idx].text)
        idx++
      }
      const maxLen = Math.max(removes.length, adds.length)
      for (let k = 0; k < maxLen; k++) {
        const bText = k < removes.length ? removes[k] : ''
        const aText = k < adds.length ? adds[k] : ''
        const textsEqual = bText !== '' && aText !== '' && bText === aText
        rows.push({
          before: k < removes.length
            ? { lineNumber: bLine++, text: bText, variant: textsEqual ? 'neutral' : 'changed' }
            : { lineNumber: null, text: '', variant: 'neutral' },
          after: k < adds.length
            ? { lineNumber: aLine++, text: aText, variant: textsEqual ? 'neutral' : 'changed' }
            : { lineNumber: null, text: '', variant: 'neutral' },
          isChanged: !textsEqual
        })
      }
    }
  }
  return rows
}

const beforeLines = computed(() => normalizeLines(props.beforeContent))
const afterLines = computed(() => normalizeLines(props.afterContent))
const diffOps = computed(() => buildDiffOps(beforeLines.value, afterLines.value))
const pairRows = computed(() => buildPairRows(diffOps.value))

const changedRowIndices = computed(() =>
  pairRows.value
    .map((row, index) => row.isChanged ? index : -1)
    .filter(index => index !== -1)
)

const diffStats = computed(() => diffOps.value.reduce((stats, op) => {
  if (op.type === 'add') stats.added++
  else if (op.type === 'remove') stats.removed++
  return stats
}, { added: 0, removed: 0 }))

const hasChanges = computed(() => changedRowIndices.value.length > 0)

const handleAcceptLeft = () => emit('acceptLeft')
const handleAcceptRight = () => emit('acceptRight')

function handleGutterWheel(event: WheelEvent) {
  event.preventDefault()
  if (beforeScrollRef.value) {
    beforeScrollRef.value.scrollTop += event.deltaY
  }
}

function handleBeforeScroll() {
  handleScrollSync()
}

function handleAfterScroll() {
  if (!afterScrollRef.value) return
  const top = afterScrollRef.value.scrollTop
  if (beforeScrollRef.value) beforeScrollRef.value.scrollTop = top
  if (gutterScrollRef.value) gutterScrollRef.value.scrollTop = top
}

function findNearestChangeIndex(): number {
  const el = beforeScrollRef.value
  const indices = changedRowIndices.value
  if (!el || indices.length === 0) return -1

  const viewportTop = el.scrollTop + el.clientHeight / 3

  let bestIndex = 0
  let bestDist = Infinity
  for (let i = 0; i < indices.length; i++) {
    const row = el.querySelector(`[data-row-index="${indices[i]}"]`) as HTMLElement | null
    if (!row) continue
    const dist = Math.abs(row.offsetTop - viewportTop)
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }
  return bestIndex
}

function handleScrollSync() {
  if (changedRowIndices.value.length === 0) return
  activeChangeIndex.value = findNearestChangeIndex()
}

function scrollToRow(rowIndex: number) {
  const row = beforeScrollRef.value?.querySelector(`[data-row-index="${rowIndex}"]`) as HTMLElement | null
  if (!row || !beforeScrollRef.value) return
  const top = row.offsetTop - (beforeScrollRef.value.clientHeight / 2) + (row.offsetHeight / 2)
  beforeScrollRef.value.scrollTop = top
  if (afterScrollRef.value) afterScrollRef.value.scrollTop = top
  if (gutterScrollRef.value) gutterScrollRef.value.scrollTop = top
}

function handlePrevChange() {
  if (!hasChanges.value) return
  const current = findNearestChangeIndex()
  const target = current > 0 ? current - 1 : 0
  activeChangeIndex.value = target
  scrollToRow(changedRowIndices.value[target])
}

function handleNextChange() {
  if (!hasChanges.value) return
  const current = findNearestChangeIndex()
  const target = current < changedRowIndices.value.length - 1 ? current + 1 : changedRowIndices.value.length - 1
  activeChangeIndex.value = target
  scrollToRow(changedRowIndices.value[target])
}

watch(pairRows, () => {
  activeChangeIndex.value = -1
  if (changedRowIndices.value.length === 0) return

  nextTick(() => {
    const firstChangeIndex = changedRowIndices.value[0]
    activeChangeIndex.value = 0
    scrollToRow(firstChangeIndex)
  })
}, { immediate: true })

  return {
    t,
    EaIcon,
    beforeScrollRef,
    afterScrollRef,
    gutterScrollRef,
    activeChangeIndex,
    pairRows,
    changedRowIndices,
    diffStats,
    hasChanges,
    handleAcceptLeft,
    handleAcceptRight,
    handleGutterWheel,
    handleBeforeScroll,
    handleAfterScroll,
    handlePrevChange,
    handleNextChange
  }
}
