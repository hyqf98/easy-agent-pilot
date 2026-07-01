// Atlas 纹理工厂 —— 加载本地已下载的宠物精灵图并切片。
//
// 改自 pixi-pet-demo/src/assets/atlasTextureFactory.ts。核心差异：本应用从本地已下载的精灵图加载，
// 不再从 codex-pets.net 远程拉取。spritesheetSrc 是 convertFileSrc 产生的、保留 .webp 扩展名的 URL
// （Pixi v8 的 asset resolver 按 URL 扩展名解析 loader，blob: 等无扩展名 URL 会静默失败）。
// 附件纹理（shadow / particle / emote）仍程序化生成。

import { Assets, Graphics, Rectangle, Texture } from 'pixi.js'

import type { Renderer } from 'pixi.js'

import type { AtlasTextures } from './types'
import {
  CODEX_ATLAS_COLS,
  CODEX_ATLAS_ROWS,
  CODEX_CELL_HEIGHT,
  CODEX_CELL_WIDTH,
  looksLikeCodexAtlas,
} from './codexAtlas'

// 加载一张精灵图、切片 8x9 网格、附带附件纹理。
//
// spritesheetSrc 必须保留文件扩展名（.webp/.png），否则 Pixi v8 的 resolver 无法匹配纹理 loader。
// convertFileSrc 产出的 `https://asset.localhost/.../spritesheet.webp` 满足该要求。
export async function loadPetTextures(
  renderer: Renderer,
  spritesheetSrc: string
): Promise<AtlasTextures> {
  const atlas = await Assets.load(spritesheetSrc)
  validateAtlasShape(atlas)

  const source = atlas.source
  source.scaleMode = 'nearest'

  const cells = sliceAtlasGrid(atlas)

  return {
    atlas,
    cells,
    shadow: createShadowTexture(renderer),
    particle: createParticleTexture(renderer),
    emote: createEmoteTexture(renderer),
  }
}

function validateAtlasShape(atlas: Texture): void {
  const width = atlas.width
  const height = atlas.height
  if (!looksLikeCodexAtlas(width, height)) {
    throw new Error(
      `spritesheet ${width}x${height} does not match the Codex 8x9 / 192x208 atlas contract`
    )
  }
}

// 把源切片成 cells[row][col]。每个单元在 GPU 上共享一个 TextureSource，仅 frame Rectangle 不同。
// 这是 pixi v8 的惯用切片 —— `new Texture({ source, frame })`（v7 的位置式构造器已移除）。
function sliceAtlasGrid(atlas: Texture): Texture[][] {
  const source = atlas.source
  const cells: Texture[][] = []
  for (let row = 0; row < CODEX_ATLAS_ROWS; row += 1) {
    const rowCells: Texture[] = []
    for (let col = 0; col < CODEX_ATLAS_COLS; col += 1) {
      rowCells.push(
        new Texture({
          source,
          frame: new Rectangle(
            col * CODEX_CELL_WIDTH,
            row * CODEX_CELL_HEIGHT,
            CODEX_CELL_WIDTH,
            CODEX_CELL_HEIGHT
          ),
        })
      )
    }
    cells.push(rowCells)
  }
  return cells
}

// --- 附件纹理（保持程序化；小且分辨率稳定） ------------------------------

function createShadowTexture(renderer: Renderer): Texture {
  const graphic = new Graphics()

  graphic.ellipse(10, 5, 9, 4).fill({ color: '#130c0a', alpha: 0.3 })

  return renderer.generateTexture({
    target: graphic,
    frame: new Rectangle(0, 0, 20, 10),
    textureSourceOptions: {
      scaleMode: 'nearest',
    },
  })
}

function createParticleTexture(renderer: Renderer): Texture {
  const graphic = new Graphics()

  graphic.rect(0, 0, 2, 2).fill('#ffe07a')

  return renderer.generateTexture({
    target: graphic,
    frame: new Rectangle(0, 0, 2, 2),
    textureSourceOptions: {
      scaleMode: 'nearest',
    },
  })
}

function createEmoteTexture(renderer: Renderer): Texture {
  // EmoteBubble 使用的小心形字形。用圆角矩形绘制，使它在气泡的缩放下读起来仍是心形。
  const graphic = new Graphics()
  const red = '#ff2f52'

  graphic.rect(2, 1, 3, 3).fill(red)
  graphic.rect(6, 1, 3, 3).fill(red)
  graphic.rect(1, 2, 9, 3).fill(red)
  graphic.rect(2, 5, 7, 2).fill(red)
  graphic.rect(3, 7, 5, 1).fill(red)
  graphic.rect(4, 8, 3, 1).fill(red)
  graphic.rect(5, 9, 1, 1).fill(red)

  return renderer.generateTexture({
    target: graphic,
    frame: new Rectangle(0, 0, 11, 10),
    textureSourceOptions: {
      scaleMode: 'nearest',
    },
  })
}
