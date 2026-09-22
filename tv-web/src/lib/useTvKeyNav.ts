import { useEffect, type RefObject } from 'react'
import { TIZEN_RETURN_KEYCODE } from './useRemoteNav'

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface TvKeyNavOptions {
  /**
   * Trata a tecla Voltar do controle (Backspace/Escape/XF86Back/keyCode
   * 10009) como "volta ao focável anterior" dentro do contêiner, em vez de
   * sair da tela imediatamente. É o comportamento de formulário: no meio
   * dos campos, Voltar move o foco para o campo anterior; no primeiro
   * focável, Voltar chama `onBack` (se informado) — senão é consumido sem
   * efeito. Deve ser usado junto com `onBack`, e o `useRemoteNav({ onBack })`
   * da tela deve ser removido para não haver dois listeners disputando a
   * mesma tecla.
   */
  onBackField?: boolean
  /**
   * Chamado quando `onBackField` está ativo e o foco já está no primeiro
   * focável do contêiner — ou seja, a hora certa de realmente sair da tela.
   */
  onBack?: () => void
}

/**
 * Enables D-pad (remote control) navigation within a screen container.
 * Plain web focus only moves via Tab, which TV remotes never send —
 * this maps ArrowUp/Left to "previous" and ArrowDown/Right to "next"
 * across the container's focusable elements in DOM order, and focuses
 * the first one on mount.
 */
export function useTvKeyNav(
  containerRef: RefObject<HTMLElement | null>,
  { onBackField = false, onBack }: TvKeyNavOptions = {},
) {
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
      const isBack =
        onBackField &&
        (event.key === 'Backspace' ||
          event.key === 'Escape' ||
          event.key === 'XF86Back' ||
          event.keyCode === TIZEN_RETURN_KEYCODE)
      
      const isEnter = event.key === 'Enter' || event.keyCode === 13
      if (isEnter) {
        if (document.activeElement?.tagName === 'BUTTON' || document.activeElement?.hasAttribute('tabindex')) {
          event.preventDefault()
          ;(document.activeElement as HTMLElement).click()
        }
        return
      }

      if (!goNext && !goPrev && !isBack) return

      const list = getFocusable()
      if (list.length === 0) return

      const currentIndex = list.indexOf(document.activeElement as HTMLElement)
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.min(
              Math.max(currentIndex + (goNext ? 1 : goPrev ? -1 : isBack ? -1 : 0), 0),
              list.length - 1,
            )

      if (nextIndex !== currentIndex) {
        event.preventDefault()
        list[nextIndex].focus()
      } else if (isBack) {
        // No primeiro focável: é a hora certa de sair da tela. Chamamos
        // `onBack` (se houver) e sempre consumimos a tecla — sem o
        // `preventDefault`, um `useRemoteNav` residual também dispararia.
        event.preventDefault()
        onBack?.()
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
