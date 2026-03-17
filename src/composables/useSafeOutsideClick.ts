import { onMounted, onUnmounted } from 'vue'

type MaybeElement = HTMLElement | null | undefined

export function useSafeOutsideClick(
  getElements: () => MaybeElement[],
  onOutsideClick: () => void
) {
  let pointerDownStartedOutside = false

  const isOutsideAll = (target: EventTarget | null) => {
    const node = target as Node | null
    if (!node) {
      return true
    }

    return getElements()
      .filter((element): element is HTMLElement => Boolean(element))
      .every(element => !element.contains(node))
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      pointerDownStartedOutside = false
      return
    }

    pointerDownStartedOutside = isOutsideAll(event.target)
  }

  const handleClick = (event: MouseEvent) => {
    if (event.button !== 0) {
      return
    }

    const shouldClose = pointerDownStartedOutside && isOutsideAll(event.target)
    pointerDownStartedOutside = false

    if (shouldClose) {
      onOutsideClick()
    }
  }

  onMounted(() => {
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('click', handleClick, true)
  })

  onUnmounted(() => {
    document.removeEventListener('pointerdown', handlePointerDown, true)
    document.removeEventListener('click', handleClick, true)
  })
}
