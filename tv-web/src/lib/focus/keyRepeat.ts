/**
 * Navegação contínua por auto-repetição de tecla (feature 046, `logic/key-repeat.md`).
 *
 * STUB do sdd-plan (não travado) — a assinatura é a definitiva; o corpo é do
 * executor (T002). Quem agenda trabalho por foco (hoje só o prefetch de
 * categoria) lê `useKeyRepeatBurst()` e não age enquanto for `true`.
 */

/** Sem novo evento de seta repetido por este tempo, a rajada acaba (cobre um `keyup` perdido). */
export const KEY_REPEAT_QUIET_MS = 300

/** `true` enquanto uma seta é segurada (`KeyboardEvent.repeat`) — nunca para toque isolado. */
export function useKeyRepeatBurst(): boolean {
  throw new Error('not implemented')
}

/** Só para testes: desmonta o rastreador e volta a "sem rajada". */
export function resetKeyRepeatTracker(): void {
  // no-op provisório (T002 o implementa): existe pra os contratos limparem o estado sem quebrar antes da hora.
}
