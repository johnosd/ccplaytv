import { useEffect, useRef } from 'react'

export type RemoteDirection = 'up' | 'down' | 'left' | 'right'

export interface RemoteNavHandlers {
  onDirection?: (direction: RemoteDirection) => void
  onSelect?: () => void
  /**
   * Opcional (feature 013, `logic/gesto-ok-longo.md`). Quando definido NO
   * MOMENTO do primeiro `keydown` do OK, o pressionamento vira um gesto: OK
   * curto chama `onSelect` ao SOLTAR a tecla; segurar além do limiar chama
   * `onLongSelect` uma única vez, e soltar depois não faz mais nada. O modo
   * é decidido nesse instante e não muda durante o pressionamento — quando
   * indefinido, o OK continua agindo no `keydown`, como sempre agiu.
   */
  onLongSelect?: () => void
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
  /** Limiar do gesto de `onLongSelect`, em ms. Padrão: `LONG_SELECT_MS`. */
  longSelectMs?: number
}

/** Limiar padrão de "segurar OK" para virar `onLongSelect` (feature 013). */
export const LONG_SELECT_MS = 800

/**
 * Um `keydown` de OK mais afastado do anterior que isto é tratado como um
 * pressionamento NOVO, não como auto-repetição do mesmo gesto — cobre o
 * caso de um `keyup` perdido pela plataforma (o gesto anterior é
 * descartado sem chamar handler nenhum, ver `logic/gesto-ok-longo.md`).
 */
const STALE_PRESS_MS = 1000

interface PendingPress {
  lastEventAt: number
  longFired: boolean
  timer: ReturnType<typeof setTimeout>
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
  { onDirection, onSelect, onLongSelect, onBack }: RemoteNavHandlers,
  { modal = false, longSelectMs = LONG_SELECT_MS }: RemoteNavOptions = {},
) {
  const handlersRef = useRef({ onDirection, onSelect, onLongSelect, onBack })
  // Gesto de OK em andamento (feature 013) — `null` fora de um
  // pressionamento. Vive em `useRef`, não em estado: nada aqui precisa
  // re-renderizar a tela, só decidir o que o próximo evento de teclado faz.
  const pressRef = useRef<PendingPress | null>(null)

  useEffect(() => {
    handlersRef.current = { onDirection, onSelect, onLongSelect, onBack }
  })

  useEffect(() => {
    function cancelPress() {
      const press = pressRef.current
      if (!press) return
      clearTimeout(press.timer)
      pressRef.current = null
    }

    /**
     * OK no keydown — pode ser o início de um gesto (`onLongSelect`
     * definido) ou, no modo legado, a própria ação. Ver
     * `sdd/specs/013-favoritos/logic/gesto-ok-longo.md`.
     */
    function handleSelectKeyDown(event: KeyboardEvent) {
      event.preventDefault()
      if (modal) event.stopImmediatePropagation()

      const now = Date.now()
      const press = pressRef.current
      if (press) {
        if (now - press.lastEventAt < STALE_PRESS_MS) {
          // Auto-repetição do controle ao segurar: o MESMO gesto continua,
          // não conta como um pressionamento novo nem reinicia o timer.
          press.lastEventAt = now
          return
        }
        // `keyup` do pressionamento anterior nunca chegou — descarta sem
        // acionar handler nenhum e começa um gesto novo abaixo.
        cancelPress()
      }

      if (!handlersRef.current.onLongSelect) {
        // Modo legado: sem gesto, o OK age aqui mesmo, como sempre agiu.
        handlersRef.current.onSelect?.()
        return
      }

      const timer = setTimeout(() => {
        const current = pressRef.current
        if (!current) return
        current.longFired = true
        handlersRef.current.onLongSelect?.()
      }, longSelectMs)
      pressRef.current = { lastEventAt: now, longFired: false, timer }
    }

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

      if (isSelect) {
        handleSelectKeyDown(event)
        return
      }

      event.preventDefault()
      // Fase de captura + stopImmediatePropagation: garante que nenhum
      // listener de bubble-phase por baixo (useTvKeyNav/useRemoteNav da
      // tela por trás do diálogo) reaja à mesma tecla neste evento.
      if (modal) event.stopImmediatePropagation()

      if (direction) handlersRef.current.onDirection?.(direction)
      else if (isBack) handlersRef.current.onBack?.()
    }

    /**
     * Soltar o OK — só importa quando existe um gesto em andamento (modo
     * legado nunca cria `pressRef`, então esta função não faz nada nele).
     * `keyup` sem `keydown` prévio (evento de outra tela, ou um gesto já
     * descartado por `STALE_PRESS_MS`) também não faz nada.
     */
    function handleKeyUp(event: KeyboardEvent) {
      const isSelect = event.key === 'Enter' || event.key === ' '
      if (!isSelect) return
      const press = pressRef.current
      if (!press) return

      event.preventDefault()
      if (modal) event.stopImmediatePropagation()

      clearTimeout(press.timer)
      pressRef.current = null
      if (!press.longFired) handlersRef.current.onSelect?.()
    }

    document.addEventListener('keydown', handleKeyDown, modal)
    document.addEventListener('keyup', handleKeyUp, modal)
    // Um gesto interrompido (troca de app, tela apagada, devtools) nunca
    // deve agir quando o foco/visibilidade volta — sem isto, um `keyup`
    // que a plataforma entregasse atrasado poderia disparar `onSelect`
    // fora de contexto.
    window.addEventListener('blur', cancelPress)
    document.addEventListener('visibilitychange', cancelPress)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, modal)
      document.removeEventListener('keyup', handleKeyUp, modal)
      window.removeEventListener('blur', cancelPress)
      document.removeEventListener('visibilitychange', cancelPress)
      cancelPress()
    }
  }, [modal, longSelectMs])
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
