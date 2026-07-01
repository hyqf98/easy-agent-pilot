// 默认宠物配置（对应 192x208 的精灵图单元尺寸）。
//
// 从 pixi-pet-demo/src/assets/pixelCat.ts 移植。idle 窗口有意足够长（≥6s），始终超过
// 环境池的休息时长（2.6–5.2s），使停泊的宠物可靠地进入环境状态（waving/jumping/failed/…）。

import type { PetConfig } from './types'

export const defaultPetConfig: PetConfig = {
  scale: 0.75,
  walkSpeed: 76,
  idleDurationRange: [6000, 9000],
  reactionDuration: 700,
  particleCount: 18,
}
