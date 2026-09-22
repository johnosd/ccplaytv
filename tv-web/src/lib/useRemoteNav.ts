import { useEffect, useRef } from 'react'

export type RemoteDirection = 'up' | 'down' | 'left' | 'right'

export interface RemoteNavHandlers {
  onDirection?: (direction: RemoteDirection) => void
  onSelect?: () => void
  onBack?: () => void
}

export interface RemoteNavOptions {
  /**
   * Registra o listener na fase de captura e para a propagação do evento
   * assim que tratado (`stopImmediatePropagation`) — uso exclusivo de
   * componentes modais (ex.: `ConfirmDialog`) que precisam interceptar a
   * tecla ANTES da tela por baixo reagir a ela, sem depender da ordem de
   * registro dos listeners. Tela normal nunca precisa disso.
   */
  modal?: boolean
}

const DIRECTION_BY_KEY: Record<string, RemoteDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * Código da tecla RETURN do controle Samsung. Fora da faixa padrão do DOM:
 * o aparelho entrega `keyCode` 10009 sem um `event.key` equivalente a
 * `Backspace`/`Escape`, então tratar só pelo nome da tecla deixa o Voltar
 * inerte na TV — navegação presa na tela (bug
 * `sdd/bugs/tecla-voltar-return-nao-funciona-na`, reproduzido na
 * QN50Q60DAGXZD). Setas e OK não precisam disso: chegam no formato padrão.
 */
export const TIZEN_RETURN_KEYCODE = 10009

/**
 * Navegação por D-pad para telas com foco 2D/gerenciado manualmente
 * (grids, colunas independentes, abas). Diferente de `useTvKeyNav`
 * (roving-focus em ordem DOM, usado nos formulários) — aqui cada tela
 * decide o que "próximo"/"anterior" significa via `onDirection`.
 */
export function useRemoteNav(
  { onDirection, onSelect, onBack }: RemoteNavHandlers,
  { modal = false }: RemoteNavOptions = {},
) {
  const handlersRef = useRef({ onDirection, onSelect, onBack })

  useEffect(() => {
    handlersRef.current = { onDirection, onSelect, onBack }
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const direction = DIRECTION_BY_KEY[event.key]
      const isSelect = event.key === 'Enter' || event.key === ' '
      // `XF86Back` é redundância defensiva: `keyCode` é deprecado no padrão
      // DOM, e alguns engines Tizen nomeiam a mesma tecla assim.
      const isBack =
        event.key === 'Backspace' ||
        event.key === 'Escape' ||
        event.key === 'XF86Back' ||
        event.keyCode === TIZEN_RETURN_KEYCODE

      if (!direction && !isSelect && !isBack) return
      // Telas de "roving DOM focus" (useTvKeyNav + <button>/<input> reais,
      // ex. AddSourceScreen, ImportProgressScreen) não passam onSelect —
      // contam com o Enter nativo do navegador pra ativar o elemento
      // focado. Sem essa guarda, o preventDefault abaixo suprimia essa
      // ativação nativa sem nada pra substituí-la, deixando todo botão
      // dessas telas inerte no controle físico (mouse não passa por
      // keydown, por isso nunca apareceu em teste manual por mouse).
      if (isSelect && !handlersRef.current.onSelect) return
      event.preventDefault()
      // Fase de captura + stopImmediatePropagation: garante que nenhum
      // listener de bubble-phase por baixo (useTvKeyNav/useRemoteNav da
      // tela por trás do diálogo) reaja à mesma tecla neste evento.
      if (modal) event.stopImmediatePropagation()

      if (direction) handlersRef.current.onDirection?.(direction)
      else if (isSelect) handlersRef.current.onSelect?.()
      else if (isBack) handlersRef.current.onBack?.()
    }

    document.addEventListener('keydown', handleKeyDown, modal)
    return () => document.removeEventListener('keydown', handleKeyDown, modal)
  }, [modal])
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Próximo índice num grid de `cols` colunas, dada uma direção do D-pad. */
export function gridNextIndex(
  direction: RemoteDirection,
  current: number,
  length: number,
  cols: number,
): number {
  if (direction === 'left') return clamp(current - 1, 0, length - 1)
  if (direction === 'right') return clamp(current + 1, 0, length - 1)
  if (direction === 'up') return clamp(current - cols, 0, length - 1)
  return clamp(current + cols, 0, length - 1)
}
