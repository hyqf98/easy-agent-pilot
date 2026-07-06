/** 流式打字机效果：用 requestAnimationFrame 平滑追加分段到达的文本。 */
import { ref, watch, onBeforeUnmount, type Ref } from 'vue'

/**
 * 流式打字机效果：平滑追加分段到达的文本内容。
 * 用 requestAnimationFrame 实现平滑滚动，不逐字 setTimeout。
 */
export function useTypewriterStream(content: Ref<string>) {
  const displayed = ref('')
  const isTyping = ref(false)
  let rafId: number | null = null

  function cancelAnimation() {
    if (rafId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(rafId)
    }
    rafId = null
  }

  watch(content, (next) => {
    // 内容缩短（重置/编辑/清空）→ 直接同步
    if (next.length <= displayed.value.length) {
      cancelAnimation()
      displayed.value = next
      isTyping.value = false
      return
    }

    // 新增内容：用 rAF 平滑追加
    isTyping.value = true
    cancelAnimation()

    const startLen = displayed.value.length
    const targetLen = next.length
    const charCount = targetLen - startLen
    const startTime = globalThis.performance?.now() ?? Date.now()
    // 动画时长：每字符 2ms，上限 200ms（大批量更新时不过度延迟）
    const duration = Math.min(200, charCount * 2)

    const tick = (now: number) => {
      const progress = duration > 0 ? Math.min(1, (now - startTime) / duration) : 1
      const currentLen = startLen + Math.floor(charCount * progress)
      displayed.value = next.slice(0, currentLen)

      if (progress < 1) {
        rafId = globalThis.requestAnimationFrame(tick)
      } else {
        displayed.value = next
        isTyping.value = false
        rafId = null
      }
    }

    rafId = globalThis.requestAnimationFrame(tick)
  })

  onBeforeUnmount(() => {
    cancelAnimation()
  })

  return { displayed, isTyping }
}
