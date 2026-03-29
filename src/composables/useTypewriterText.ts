import { computed, onBeforeUnmount, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'

interface TypewriterOptions {
  charsPerSecond?: number
  maxChunkSize?: number
}

export function useTypewriterText(
  source: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
  options: TypewriterOptions = {}
) {
  const displayedText = ref('')
  const hasInitialized = ref(false)
  const charsPerSecond = options.charsPerSecond ?? 120
  const maxChunkSize = options.maxChunkSize ?? 20
  let frameId: number | null = null
  let lastFrameTime = 0
  let carryChars = 0

  const stopAnimation = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
    lastFrameTime = 0
    carryChars = 0
  }

  const syncImmediately = (nextText: string) => {
    stopAnimation()
    displayedText.value = nextText
  }

  const tick = () => {
    if (frameId !== null) {
      return
    }

    const targetText = toValue(source) || ''
    const isEnabled = Boolean(toValue(enabled))

    if (!isEnabled) {
      syncImmediately(targetText)
      return
    }

    if (!targetText.startsWith(displayedText.value)) {
      displayedText.value = targetText
      stopAnimation()
      return
    }

    if (displayedText.value.length >= targetText.length) {
      stopAnimation()
      return
    }

    frameId = requestAnimationFrame((timestamp) => {
      frameId = null
      if (!lastFrameTime) {
        lastFrameTime = timestamp
      }

      const elapsed = Math.max(0, timestamp - lastFrameTime)
      lastFrameTime = timestamp
      carryChars += (elapsed / 1000) * charsPerSecond

      const charsToAppend = Math.min(maxChunkSize, Math.max(1, Math.floor(carryChars)))
      carryChars = Math.max(0, carryChars - charsToAppend)
      displayedText.value = targetText.slice(0, displayedText.value.length + charsToAppend)
      tick()
    })
  }

  watch(
    [() => toValue(source) || '', () => Boolean(toValue(enabled))],
    ([nextText, isEnabled], previousValues) => {
      if (!hasInitialized.value) {
        hasInitialized.value = true

        if (nextText) {
          syncImmediately(nextText)
          return
        }
      }

      const prevText = previousValues?.[0] || ''
      if (!isEnabled) {
        syncImmediately(nextText)
        return
      }

      if (!prevText && !displayedText.value) {
        displayedText.value = ''
        tick()
        return
      }

      if (!nextText.startsWith(displayedText.value)) {
        displayedText.value = nextText
        stopAnimation()
        return
      }

      if (nextText.length > displayedText.value.length) {
        tick()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopAnimation()
  })

  return {
    displayedText: computed(() => displayedText.value)
  }
}
