import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * 单格精灵图缩略图。
 *
 * 精灵图是 8 列 × 9 行、每格 192×208 的整图。直接整图当缩略图会显示成不可辨认的 72 格。
 * 这里用 CSS background：`background-size: 800% 900%`（= 8 列宽 × 9 行高，即整图按单格放大），
 * 再用 `background-position` 精确切到指定 row/col 的单格，只显示该帧。
 *
 * 本地精灵图（convertFileSrc 产出）与远程 https 精灵图通用，永远只显示一格。
 * `lazy=true` 时通过 IntersectionObserver 在进入视口后才设置背景图，避免市场一次拉满大图。
 */
export interface PetThumbProps {
  /** 精灵图 URL（本地 convertFileSrc 或远程 https）。 */
  src: string
  /** 行索引（0-8），默认 0 = idle 行。 */
  row?: number
  /** 列索引（0-7），默认 0 = 该行首帧。 */
  col?: number
  /** 是否懒加载（进入视口才加载），默认 true。 */
  lazy?: boolean
  /** 是否圆形裁剪（卡片头像用），默认 false。 */
  round?: boolean
}

export function usePetThumb(props: PetThumbProps) {
  const elRef = ref<HTMLElement | null>(null)
  const loaded = ref(false)
  let observer: IntersectionObserver | null = null

  // 背景定位百分比：col 占比 = col / (COLS-1) * 100%，row 同理。
  // 当 background-size 是 N 倍时，position 0% 对齐左/上、100% 对齐右/下，故除以 (N-1)。
  const backgroundPosition = computed(() => {
    const cols = 8
    const rows = 9
    const col = props.col ?? 0
    const row = props.row ?? 0
    const x = cols > 1 ? (col / (cols - 1)) * 100 : 0
    const y = rows > 1 ? (row / (rows - 1)) * 100 : 0
    return `${x}% ${y}%`
  })

  const thumbStyle = computed(() => {
    if (!loaded.value) {
      return { backgroundColor: 'var(--color-bg-tertiary)' } as Record<string, string>
    }
    return {
      backgroundImage: `url("${props.src}")`,
      backgroundSize: '800% 900%',
      backgroundPosition: backgroundPosition.value,
      backgroundRepeat: 'no-repeat'
    } as Record<string, string>
  })

  function load(): void {
    if (loaded.value) return
    loaded.value = true
    cleanupObserver()
  }

  function cleanupObserver(): void {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  onMounted(() => {
    // 不懒加载：立即加载。
    if (!props.lazy) {
      load()
      return
    }
    // 懒加载：进视口才加载。
    if (!elRef.value || typeof IntersectionObserver === 'undefined') {
      load()
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            load()
            break
          }
        }
      },
      { rootMargin: '120px' }
    )
    observer.observe(elRef.value)
  })

  onUnmounted(() => {
    cleanupObserver()
  })

  return {
    elRef,
    loaded,
    thumbStyle
  }
}
