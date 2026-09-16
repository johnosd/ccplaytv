import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Enables D-pad (remote control) navigation within a screen container.
 * Plain web focus only moves via Tab, which TV remotes never send —
 * this maps ArrowUp/Left to "previous" and ArrowDown/Right to "next"
 * across the container's focusable elements in DOM order, and focuses
 * the first one on mount.
 */
export function useTvKeyNav(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function getFocusable(): HTMLElement[] {
      return Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    }

    const initial = getFocusable()
    if (initial.length > 0 && !container.contains(document.activeElement)) {
      initial[0].focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      const goNext = event.key === 'ArrowDown' || event.key === 'ArrowRight'
      const goPrev = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      if (!goNext && !goPrev) return

      const list = getFocusable()
      if (list.length === 0) return

      const currentIndex = list.indexOf(document.activeElement as HTMLElement)
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.min(Math.max(currentIndex + (goNext ? 1 : -1), 0), list.length - 1)

      if (nextIndex !== currentIndex) {
        event.preventDefault()
        list[nextIndex].focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // Intentionally runs after every render (no deps): the container can
    // mount later than the hook call when a screen has a loading guard
    // before its returned JSX. Re-running is safe because the "focus
    // first" step above only fires when nothing inside is focused yet.
  })
}
