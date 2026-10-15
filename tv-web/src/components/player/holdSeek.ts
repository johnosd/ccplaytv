import { JUMP_MS } from './playerMessages'

/**
 * Busca acelerada na barra de progresso (melhoria ad-hoc 2026-10-10): segurar ← / → salta cada vez mais longe. Sem React,
 * só o relógio recebido — testável sem DOM. O primeiro toque continua valendo `JUMP_MS` (10 s), como sempre foi.
 */

/** Tempo segurando (ms) a partir do qual vale o passo; do maior limiar para o menor. */
const STEPS: ReadonlyArray<readonly [heldMs: number, stepMs: number]> = [
  [6000, 120_000],
  [3000, 60_000],
  [1000, 30_000],
]

/**
 * Dois eventos da mesma direção com menos que isto entre si são "o mesmo segurar". Folga acima do atraso inicial da
 * auto-repetição da TV (que vem antes da cadência rápida); um toque solto bem depois zera a aceleração.
 */
const HOLD_GAP_MS = 600

export function holdStepMs(heldMs: number): number {
  return STEPS.find(([threshold]) => heldMs >= threshold)?.[1] ?? JUMP_MS
}

export interface HoldSeek {
  /** Salto (com sinal) para este evento: negativo para `left`, positivo para `right`. */
  next(direction: 'left' | 'right', nowMs: number): number
}

export function createHoldSeek(): HoldSeek {
  let current: 'left' | 'right' | null = null
  let startedAt = 0
  let lastAt = 0
  return {
    next(direction, nowMs) {
      if (direction !== current || nowMs - lastAt > HOLD_GAP_MS) {
        current = direction
        startedAt = nowMs
      }
      lastAt = nowMs
      const step = holdStepMs(nowMs - startedAt)
      return direction === 'left' ? -step : step
    },
  }
}
