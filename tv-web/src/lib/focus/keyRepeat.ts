import { useSyncExternalStore } from 'react'

/**
 * Navegação contínua por auto-repetição de tecla (feature 046, `logic/key-repeat.md`).
 *
 * Rastreador só de leitura, paralelo ao teclado: nunca consome nem altera a
 * tecla (`useRemoteNav` segue dono dela — ADR-009). Quem agenda trabalho por
 * foco (hoje só o prefetch de categoria) lê `useKeyRepeatBurst()` e não age
 * enquanto for `true`.
 *
 * Os listeners ficam em `window`, na captura: um `Modal`
 * (`useRemoteNav({modal:true})`) captura em `document` e para a propagação —
 * um listener em `document` ficaria cego durante ele.
 */

/** Sem novo evento de seta repetido por este tempo, a rajada acaba (cobre um `keyup` perdido). */
export const KEY_REPEAT_QUIET_MS = 300

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

let burst = false
let quietTimer: ReturnType<typeof setTimeout> | undefined
let attached = false
const listeners = new Set<() => void>()

function setBurst(next: boolean) {
  if (burst === next) return
  burst = next
  listeners.forEach((listener) => listener())
}

function endBurst() {
  clearTimeout(quietTimer)
  quietTimer = undefined
  setBurst(false)
}

function onKeyDown(event: KeyboardEvent) {
  // Outra tecla, ou toque isolado (`repeat: false`): nunca é rajada.
  if (!ARROWS.has(event.key) || !event.repeat) {
    endBurst()
    return
  }
  setBurst(true)
  clearTimeout(quietTimer)
  quietTimer = setTimeout(endBurst, KEY_REPEAT_QUIET_MS)
}

function onKeyUp(event: KeyboardEvent) {
  if (ARROWS.has(event.key)) endBurst()
}

function attach() {
  if (attached) return
  attached = true
  window.addEventListener('keydown', onKeyDown, { capture: true, passive: true })
  window.addEventListener('keyup', onKeyUp, { capture: true, passive: true })
  window.addEventListener('blur', endBurst)
  document.addEventListener('visibilitychange', endBurst)
}

function detach() {
  if (!attached) return
  attached = false
  window.removeEventListener('keydown', onKeyDown, { capture: true })
  window.removeEventListener('keyup', onKeyUp, { capture: true })
  window.removeEventListener('blur', endBurst)
  document.removeEventListener('visibilitychange', endBurst)
  endBurst()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  attach()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) detach()
  }
}

/** Leitura síncrona do estado atual (sem assinar). */
export function isKeyRepeatBurst(): boolean {
  return burst
}

/**
 * Avisa, de forma síncrona, cada mudança de estado da rajada — para quem precisa
 * reagir na hora (cancelar/rearmar um timer) sem esperar um novo render do React.
 * Devolve a função que cancela a assinatura.
 */
export function subscribeKeyRepeatBurst(onChange: (fast: boolean) => void): () => void {
  return subscribe(() => onChange(burst))
}

/** `true` enquanto uma seta é segurada (`KeyboardEvent.repeat`) — nunca para toque isolado. */
export function useKeyRepeatBurst(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => burst,
    () => false,
  )
}

/** Só para testes: desmonta o rastreador e volta a "sem rajada". */
export function resetKeyRepeatTracker(): void {
  listeners.clear()
  detach()
}
