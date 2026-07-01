// 桌面宠物渲染引擎的核心类型。
//
// 从 pixi-pet-demo/src/pet/types.ts 移植（PixiJS v8，1536x1872 / 8x9 / 192x208 精灵图契约）。
// 仅作模块路径调整，逻辑保持一致。

import type { Texture } from 'pixi.js'

export type PetState = 'idle' | 'walk' | 'react'

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface PetConfig {
  scale: number
  walkSpeed: number
  idleDurationRange: [minMs: number, maxMs: number]
  reactionDuration: number
  particleCount: number
}

export interface PetSnapshot {
  state: PetState
  position: Point
  facing: 1 | -1
  target: Point | null
  stateElapsedMs: number
  stateDurationMs: number
  movedThisFrame: boolean
}

// --- Codex hatch-pet atlas model -----------------------------------------
//
// 宠物不是程序化绘制，而是一张 1536x1872 的精灵图（8 列 x 9 行，每格 192x208），
// 切片成每格一个 Texture。每一行编码一个动画状态，渲染器按 layout 表选行、按该行
// fps 逐帧推进。

export interface PetAtlasRowDef {
  // 在精灵图中从上到下的行索引。
  index: number
  // 行选择引擎使用的稳定 id（idle, waving, ...）。
  id: string
  // 该行实际使用的帧数（超出部分透明）。
  frames: number
  // 该行推荐的播放 fps。
  fps: number
}

export interface PetAtlasLayout {
  cols: number
  rows: number
  rowsDef: PetAtlasRowDef[]
}

export interface AtlasTextures {
  // 完整源纹理（8x9 网格），被每个切片单元共享。
  atlas: Texture
  // cells[row][col] —— 从 atlas 源切片的每格 Texture。行由 PetAtlasRowDef.index 索引，
  // 列由 0..frames-1 索引。
  cells: Texture[][]
  // 复用的附件纹理（控制器持有一份纹理包）。
  shadow: Texture
  particle: Texture
  emote: Texture
}

export type RandomSource = () => number
