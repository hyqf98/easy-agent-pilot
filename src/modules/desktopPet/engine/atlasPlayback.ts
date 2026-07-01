// 精灵图行选择引擎。
//
// 从 pixi-pet-demo/src/pet/atlasPlayback.ts 原样移植。
// 给定逻辑交互状态，挑选要播放的 atlas 行；请求的行缺失时走 fallback 链；
// idle 时周期性轮换"环境"行，让停泊的宠物不会显得静止。

import type { PetAtlasLayout, PetAtlasRowDef } from './types'
import type { PetState } from './types'

// 手动触发的动画动作，暴露在宠物的动作菜单中。这些是读起来像离散"动作"的 atlas 行
// （idle, waving, jumping, …）；方向性的 running-right/left 行被排除，因为它们是行走驱动的
// 移动行，而非用户可选的手势。`id` 对应 PetAtlasRowDef id；`label` 是菜单文案。
export interface PetAction {
  id: string
  label: string
}

export const PET_ACTIONS: readonly PetAction[] = [
  { id: 'idle', label: 'Idle 待机' },
  { id: 'waving', label: 'Waving 挥手' },
  { id: 'jumping', label: 'Jumping 跳跃' },
  { id: 'failed', label: 'Failed 失败' },
  { id: 'waiting', label: 'Waiting 等待' },
  { id: 'running', label: 'Running 工作' },
  { id: 'review', label: 'Review 审视' }
]

// 驱动播放哪一行的逻辑交互状态。idle 家族与 walk（携带朝向）和 react（一次性点击反应）
// 刻意分离。
export type PetAtlasInteraction =
  | 'idle'
  | 'walk-right'
  | 'walk-left'
  | 'react'

// 从 3 状态漫游模型到 atlas 交互空间的桥接。`facing` 消歧 walk 行（running-right vs running-left）。
export function demoStateToInteraction(
  state: PetState,
  facing: 1 | -1
): PetAtlasInteraction {
  switch (state) {
    case 'walk':
      return facing >= 0 ? 'walk-right' : 'walk-left'
    case 'react':
      return 'react'
    case 'idle':
    default:
      return 'idle'
  }
}

// 每个交互状态首选的 Codex atlas 行 id。walk 映射到专属的方向性 run 行，使宠物可见地转向；
// react 映射到 wave，使一次点击读起来像友好的致意。idle 是休息基线 —— 环境池仅在宠物
// 否则处于静止时触发。
const INTERACTION_ROW_ID: Record<PetAtlasInteraction, string> = {
  idle: 'idle',
  'walk-right': 'running-right',
  'walk-left': 'running-left',
  react: 'waving'
}

export function preferredRowId(state: PetAtlasInteraction): string {
  return INTERACTION_ROW_ID[state]
}

// 当首选行 id 在 layout 中缺失时走的 fallback 链。从最稳定的基线（idle）向外排序。
// 都不匹配时返回 layout 实际拥有的第一行，使播放永不空白。
const ROW_FALLBACK_ORDER: readonly string[] = [
  'idle',
  'waiting',
  'waving',
  'running',
  'running-right'
]

// 给定期望的动画 id，解析要播放的 atlas 行。先试请求的 id，再走 fallback 链，最后返回第一行。
export function pickAtlasRow(
  layout: PetAtlasLayout,
  preferred: string
): PetAtlasRowDef | undefined {
  if (!layout || layout.rowsDef.length === 0) return undefined
  const direct = layout.rowsDef.find((r) => r.id === preferred)
  if (direct) return direct
  for (const id of ROW_FALLBACK_ORDER) {
    const fallback = layout.rowsDef.find((r) => r.id === id)
    if (fallback) return fallback
  }
  return layout.rowsDef[0]
}

// 环境行池 —— idle 周期之间，覆盖层会潜入这些行，使停泊的宠物不会显得静止，
// 随机执行 atlas 任一动画状态（codex-pets.net 预览页暴露的同一"ANIMATION STATES"）。
// 排除 idle，因为它是宠物在 burst 之间返回的休息基线；其余每个状态 —— 包括 failed/waiting
// （读起来像消极或期待的情绪）—— 都可用，让宠物显得鲜活多变。
const AMBIENT_ROW_POOL: readonly string[] = [
  'waving',
  'review',
  'jumping',
  'running',
  'running-right',
  'running-left',
  'failed',
  'waiting'
]

// 从 atlas 随机挑选一个环境行，优先 AMBIENT_ROW_POOL 中的 id，并尽量避开 avoidId，
// 以免覆盖层连续重放同一微动画。atlas 只装 idle/waiting 行时返回 null，调用方可干净地 no-op。
export function pickAmbientRow(
  layout: PetAtlasLayout | undefined,
  avoidId: string | undefined,
  rng: () => number = Math.random
): PetAtlasRowDef | null {
  if (!layout || layout.rowsDef.length === 0) return null
  const pool = layout.rowsDef.filter((r) => AMBIENT_ROW_POOL.includes(r.id))
  if (pool.length === 0) return null
  const candidates =
    pool.length > 1 && avoidId ? pool.filter((r) => r.id !== avoidId) : pool
  const choices = candidates.length > 0 ? candidates : pool

  return choices[Math.floor(rng() * choices.length)] ?? null
}
