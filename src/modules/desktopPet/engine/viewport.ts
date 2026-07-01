// 视口边界工具：根据窗口尺寸与宠物足迹计算漫游 Bounds。
// 从 pixi-pet-demo/src/app/viewport.ts 原样移植。

import type { Bounds } from './types'

export function createViewportBounds(
  width: number,
  height: number,
  footprint: { halfWidth: number; height: number },
  padding = 12
): Bounds {
  return {
    minX: footprint.halfWidth + padding,
    maxX: Math.max(footprint.halfWidth + padding, width - footprint.halfWidth - padding),
    minY: footprint.height + padding,
    maxY: Math.max(footprint.height + padding, height - padding),
  }
}
