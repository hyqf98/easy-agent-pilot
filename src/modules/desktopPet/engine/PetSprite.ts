// PetSprite —— 逐帧渲染：解析行/列、镜像、反弹。
// 从 pixi-pet-demo/src/pet/PetSprite.ts 原样移植，仅调整模块路径。

import { Container, Sprite } from 'pixi.js'

import { CODEX_CELL_HEIGHT, CODEX_CELL_WIDTH } from './codexAtlas'
import {
  demoStateToInteraction,
  pickAmbientRow,
  pickAtlasRow,
  preferredRowId
} from './atlasPlayback'

import type {
  AtlasTextures,
  PetAtlasLayout,
  PetAtlasRowDef,
  PetConfig,
  PetSnapshot
} from './types'

// 环境时序 —— 宠物在 idle 基线上休息多久后潜入环境池。休息窗口是挂钟计时器（idle 本身
// 是循环基线，没有"结束"）；但环境动作一旦开始，就播放到完成一整帧循环，而非固定时长
// —— 见 loopsRemaining。镜像上游 codex-pets 行为，使停泊宠物永不静止。
const AMBIENT_REST_MIN_MS = 2600
const AMBIENT_REST_MAX_MS = 5200

// atlas 仅装"running"行 —— 没有专门的走路动画。（经官方 hatch-pet 规范确认：1/2 行
// "running-right/left" 是移动行；契约中没有 walking 行。）按原生 fps 播放这些行。
const WALK_ROW_IDS = new Set<string>()

type AmbientPhase = 'resting' | 'playing'

export class PetSprite {
  readonly view = new Container()

  private readonly textures: AtlasTextures
  private readonly layout: PetAtlasLayout
  private readonly config: PetConfig
  private readonly shadow: Sprite
  private readonly sprite: Sprite

  private activeInteraction: string = 'idle'
  // 当前活动行的播放时钟（用于计算列）。
  private animationElapsedMs = 0
  // 上一帧的行 id + 列索引，用于检测当前动画何时回到第 0 帧 —— 即完成一个完整循环。
  // 状态切换（覆盖结束 / 下一个环境动作）推迟到循环完成时进行，使动作始终完整播放后才被中断。
  private prevRowId = 'idle'
  private prevColumn = 0

  // 环境相位时钟 —— 静止时倒计时。到 0 时宠物挑选一个环境动作并恰好播放其一帧循环，
  // 然后返回静止。每帧由 deltaMs 推进。
  private ambientPhase: AmbientPhase = 'resting'
  private ambientTimerMs = randomRestDuration()
  // 当前播放的环境行（静止时为 null）。环境 burst 开始时设置；循环完成后清除。
  private ambientRowId: string | null = null

  // 手动动作覆盖。设置后（经 playAction），精灵播放请求行直到完成 loopsToPlay 个完整循环，
  // 然后清除以恢复自动循环。让用户点菜单动作强制特定动画（waving, jumping, failed, …）。
  // 激活期间宠物原地冻结，使动作不会视觉叠加在 walk/run 之上。
  private overrideRowId: string | null = null
  private frozenPosition: { x: number; y: number } | null = null
  // 覆盖应运行的完整循环数，以及已完成的循环数。两个循环读起来像有意手势，而非单次抽搐
  // （review 6 帧 / 6 fps 每循环仅约 1s）。
  private loopsToPlay = 2
  private loopsPlayed = 0

  // 当前是否正在播放手动覆盖。控制器据此暂停漫游大脑，使 walk 状态不会切断动作。
  get isActionPlaying(): boolean {
    return this.overrideRowId !== null
  }

  constructor(textures: AtlasTextures, layout: PetAtlasLayout, config: PetConfig) {
    this.textures = textures
    this.layout = layout
    this.config = config

    const idleRow = pickAtlasRow(this.layout, 'idle') ?? this.layout.rowsDef[0]

    this.shadow = new Sprite(textures.shadow)
    this.shadow.anchor.set(0.5)
    this.shadow.y = 6
    this.shadow.alpha = 0.7
    this.shadow.roundPixels = true

    this.sprite = new Sprite(this.textures.cells[idleRow.index][0])
    this.sprite.anchor.set(0.5, 1)
    this.sprite.texture.source.scaleMode = 'nearest'
    this.sprite.roundPixels = true

    this.view.sortableChildren = true
    this.view.addChild(this.shadow, this.sprite)
    this.view.scale.set(config.scale)
  }

  update(snapshot: PetSnapshot, deltaMs: number): void {
    const isOverriding = this.overrideRowId !== null

    const interaction = demoStateToInteraction(snapshot.state, snapshot.facing)

    // 手动动作覆盖播放期间，冻结宠物在原地，让覆盖的播放时钟不间断推进 —— 我们不能运行
    // 下面的交互切换重置块，因为行走每帧翻转朝向，会反复清零动画时钟、重放第 0 帧，
    // 使动作看起来像卡在 run 之上抖动。
    if (isOverriding) {
      this.animationElapsedMs += deltaMs
    } else if (interaction !== this.activeInteraction) {
      // 交互变化重置逐行播放时钟，并打断任何环境微动画。
      this.activeInteraction = interaction
      this.animationElapsedMs = 0
      this.ambientPhase = 'resting'
      this.ambientTimerMs = randomRestDuration()
    } else {
      this.animationElapsedMs += deltaMs
    }

    const rowDef = this.resolveRowDef(interaction, deltaMs)
    const column = this.resolveColumn(rowDef)

    this.sprite.texture = this.textures.cells[rowDef.index][column]
    // 提交本帧纹理后，检查动画是否刚完成一个完整循环。若是，推进基于动作的状态
    // （结束覆盖 / 环境 burst），使下一帧可切换 —— 绝不在循环中途。
    this.onLoopComplete(rowDef.id, column)
    // 朝向处理。atlas 装有专属的 `running-left` 行（已朝左），因此该行永不镜像。
    // 其余每行（idle, waving, running-right, 环境池…）都朝右绘制；当宠物向左移动/站立时
    // 镜像这些行，使角色面向行进方向。避免左向行被镜像回右的双重翻转 bug。
    const isNativeLeftRow = rowDef.id === 'running-left'
    const mirror = !isNativeLeftRow && snapshot.facing < 0 ? -1 : 1
    this.sprite.scale.set(mirror, 1)

    const reactionStrength =
      snapshot.state === 'react'
        ? Math.sin(
            (snapshot.stateElapsedMs / Math.max(1, snapshot.stateDurationMs)) * Math.PI
          )
        : 0
    const bounceOffset = Math.round(reactionStrength * 12)

    // 覆盖期间宠物钉在冻结位置；否则跟随大脑的漫游位置。
    const pos = isOverriding && this.frozenPosition ? this.frozenPosition : snapshot.position
    this.view.position.set(Math.round(pos.x), Math.round(pos.y))
    this.shadow.scale.set(1 - reactionStrength * 0.18, 1 - reactionStrength * 0.08)
    this.shadow.alpha = 0.55 + reactionStrength * 0.12
    this.sprite.y = -bounceOffset
  }

  // 手动触发一个动画行（如 'waving', 'jumping', 'failed'）。覆盖优先级高于漫游交互和环境池。
  // 正在播放时再点同一（或不同）动作会干净地从第 0 帧重启 —— 宠物始终响应当前点击。
  playAction(rowId: string): void {
    this.overrideRowId = rowId
    this.animationElapsedMs = 0
    this.prevColumn = 0
    this.prevRowId = rowId
    this.loopsPlayed = 0
    this.loopsToPlay = 2
    // 冻结宠物当前位置，使强制动作原地播放而非沿行走路径滑动。
    this.frozenPosition = { x: this.view.position.x, y: this.view.position.y }
  }

  containsGlobalPoint(x: number, y: number): boolean {
    const bounds = this.view.getBounds()

    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
  }

  destroy(): void {
    this.view.destroy({ children: true })
  }

  get halfWidthPx(): number {
    return (CODEX_CELL_WIDTH * this.config.scale) / 2
  }

  get heightPx(): number {
    return CODEX_CELL_HEIGHT * this.config.scale
  }

  // 解析当前要播放的 atlas 行。真实交互（walk / react）始终经 fallback 链映射到专属行。
  // idle 特殊：先在 idle 基线上休息，然后周期性潜入环境池以增加多样性。状态切换（覆盖结束 /
  // 环境 burst 结束）不在此驱动 —— 它们从 onLoopComplete 触发，由 update 在当前动画播放完一帧循环后调用。
  private resolveRowDef(interaction: string, deltaMs: number): PetAtlasRowDef {
    // 手动动作覆盖压倒一切 —— 用户挑选的动作播放期间，漫游交互与环境池都挂起。
    if (this.overrideRowId !== null) {
      const overridden =
        pickAtlasRow(this.layout, this.overrideRowId) ?? this.layout.rowsDef[0]
      return overridden
    }

    if (interaction !== 'idle') {
      const preferred = preferredRowId(interaction as never)
      const row = pickAtlasRow(this.layout, preferred) ?? this.layout.rowsDef[0]
      return withWalkFps(row)
    }

    // idle：推进休息计时器；到 0 时开始一个环境 burst。
    this.ambientTimerMs -= deltaMs
    if (this.ambientTimerMs <= 0 && this.ambientPhase === 'resting') {
      this.ambientPhase = 'playing'
      this.ambientRowId = pickAmbientRow(this.layout, 'idle', Math.random)?.id ?? null
      this.animationElapsedMs = 0
      this.prevColumn = 0
    }

    if (this.ambientPhase === 'playing' && this.ambientRowId !== null) {
      const ambient = pickAtlasRow(this.layout, this.ambientRowId)
      if (ambient) return ambient
    }

    const idle = pickAtlasRow(this.layout, 'idle') ?? this.layout.rowsDef[0]
    return idle
  }

  // 由 update 每帧在计算列后调用。列索引回到 0（或行变化）即"循环完成"。
  // 这是推进基于动作状态的唯一点，因此切换只发生在干净帧边界 —— 绝不在动画中途。
  private onLoopComplete(rowId: string, column: number): void {
    // 行变化意味着新动画刚开始 —— 重置基线，度量新行的循环，不在第一帧误报"完成"。
    if (rowId !== this.prevRowId) {
      this.prevRowId = rowId
      this.prevColumn = column
      return
    }

    // 同行：列回到 0 且前一帧在更后位置即循环完成。
    const wrapped = column === 0 && this.prevColumn !== 0

    if (this.overrideRowId !== null && wrapped) {
      this.loopsPlayed += 1
      if (this.loopsPlayed >= this.loopsToPlay) {
        // 覆盖播放完整循环数 —— 释放并恢复漫游。
        this.overrideRowId = null
        this.frozenPosition = null
        this.animationElapsedMs = 0
        this.prevColumn = 0
        this.loopsPlayed = 0
      } else {
        this.prevColumn = column
      }
      return
    }

    if (this.ambientPhase === 'playing' && this.ambientRowId !== null && wrapped) {
      // 环境 burst 完成一个循环 —— 回到静止 idle。
      this.ambientPhase = 'resting'
      this.ambientRowId = null
      this.ambientTimerMs = randomRestDuration()
      this.animationElapsedMs = 0
      this.prevColumn = 0
      return
    }

    this.prevColumn = column
  }

  // 按行 fps 遍历活动行的列。镜像上游 AtlasSprite 状态机：
  // column = floor(elapsed / frameMs) % rowDef.frames，循环。
  private resolveColumn(rowDef: { frames: number; fps: number }): number {
    const frameMs = 1000 / rowDef.fps
    const index = Math.floor(this.animationElapsedMs / frameMs)

    return index % Math.max(1, rowDef.frames)
  }
}

function randomRestDuration(): number {
  return AMBIENT_REST_MIN_MS + (AMBIENT_REST_MAX_MS - AMBIENT_REST_MIN_MS) * Math.random()
}

// 把方向性 run 行放慢到走路节奏。返回浅拷贝，使原始行定义（不可变 atlas layout 的一部分）
// 不受影响 —— 环境池与其他渲染器仍看到原生 fps。当前是 no-op（WALK_ROW_IDS 为空），
// 因为 atlas 没有 walking 行；保留为钩子，以防未来 atlas 新增 walk 动画。
function withWalkFps(row: PetAtlasRowDef): PetAtlasRowDef {
  if (WALK_ROW_IDS.size === 0 || !WALK_ROW_IDS.has(row.id)) return row
  return { ...row, fps: row.fps }
}
