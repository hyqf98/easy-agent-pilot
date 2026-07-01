// Codex hatch-pet 精灵图契约。
//
// 从 pixi-pet-demo 移植：几何常量 + 每行动画行定义 + layout 构造器。
// 仅保留几何相关部分（去掉了远程 catalog 与 URL —— 本应用从本地已下载的精灵图加载）。
//
// 精灵图规格（与 codex-pets.net 一致）：
//   - 格式：PNG 或 WebP，透明背景。
//   - 尺寸：1536 x 1872 px。
//   - 网格：8 列 x 9 行，每格 192 x 208。
//   - 每一行编码一个动画状态（idle, running-right, ...）。

export const CODEX_ATLAS_COLS = 8
export const CODEX_ATLAS_ROWS = 9
export const CODEX_CELL_WIDTH = 192
export const CODEX_CELL_HEIGHT = 208
export const CODEX_ATLAS_WIDTH = CODEX_ATLAS_COLS * CODEX_CELL_WIDTH // 1536
export const CODEX_ATLAS_HEIGHT = CODEX_ATLAS_ROWS * CODEX_CELL_HEIGHT // 1872
export const CODEX_ATLAS_ASPECT = CODEX_ATLAS_WIDTH / CODEX_ATLAS_HEIGHT // ~0.821

export interface CodexAtlasRow {
  // 在精灵图中从上到下的行索引。顺序与 hatch-pet 技能的 animation-rows 参考一致。
  index: number
  // 行选择引擎与 React/PixiJS keys 使用的稳定 id。
  id:
    | 'idle'
    | 'running-right'
    | 'running-left'
    | 'waving'
    | 'jumping'
    | 'failed'
    | 'waiting'
    | 'running'
    | 'review'
  // 该行使用的帧数。上游要求超出该索引的帧透明，因此播放上限为该数量。
  frames: number
  // 推荐 fps，使条带以与 Codex 应用相近的节奏播放。
  fps: number
}

// 对应 hatch-pet 技能的 references/animation-rows.md。
export const CODEX_ATLAS_ROWS_DEF: CodexAtlasRow[] = [
  { index: 0, id: 'idle', frames: 6, fps: 6 },
  { index: 1, id: 'running-right', frames: 8, fps: 8 },
  { index: 2, id: 'running-left', frames: 8, fps: 8 },
  { index: 3, id: 'waving', frames: 4, fps: 6 },
  { index: 4, id: 'jumping', frames: 5, fps: 7 },
  { index: 5, id: 'failed', frames: 8, fps: 7 },
  { index: 6, id: 'waiting', frames: 6, fps: 6 },
  { index: 7, id: 'running', frames: 6, fps: 8 },
  { index: 8, id: 'review', frames: 6, fps: 6 },
]

// 仅长宽比校验即可处理为传输而缩放的 WebP/PNG atlas。接受与标准 8x9 / 192x208
// 长宽比误差 ~6% 以内的任意图片，能捕获缩放变体同时排除普通截图与自拍。
export function looksLikeCodexAtlas(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false
  if (width <= 0 || height <= 0) return false
  const aspect = width / height

  return Math.abs(aspect - CODEX_ATLAS_ASPECT) < 0.06
}

// 描述网格 + 每行播放配置的标准 layout 对象。渲染器据此切片并知道有哪些行。
export function buildCodexAtlasLayout(): {
  cols: number
  rows: number
  rowsDef: { index: number; id: string; frames: number; fps: number }[]
} {
  return {
    cols: CODEX_ATLAS_COLS,
    rows: CODEX_ATLAS_ROWS,
    rowsDef: CODEX_ATLAS_ROWS_DEF.map((row) => ({
      index: row.index,
      id: row.id,
      frames: row.frames,
      fps: row.fps,
    })),
  }
}
