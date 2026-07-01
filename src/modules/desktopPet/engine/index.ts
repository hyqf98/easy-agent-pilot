// 桌面宠物渲染引擎（PixiJS v8 移植自 pixi-pet-demo）。
//
// 引擎是纯渲染层，不依赖 Vue/Tauri。PetView（Vue 组件）通过 createPetApp 驱动它。

export { createPetApp } from './createPetApp'
export type { PetApp, PetAppOptions } from './createPetApp'
export { PET_ACTIONS } from './atlasPlayback'
export type { PetAction } from './atlasPlayback'
export { CODEX_ATLAS_ROWS_DEF, CODEX_ATLAS_ROWS, CODEX_ATLAS_COLS } from './codexAtlas'
export type { CodexAtlasRow } from './codexAtlas'
export { defaultPetConfig } from './petConfig'
export type { PetConfig, Bounds } from './types'
export { createViewportBounds } from './viewport'
