/**
 * Faixa do ajuste da legenda externa (feature 090, FR-008, `logic/legenda-externa.md` §4.1). Módulo sem dependências:
 * o painel do player o importa sem puxar banco nem codec para o carregamento do player (D-012).
 */
export const EXTERNAL_DELAY_LIMIT_MS = 10_000
export const EXTERNAL_DELAY_STEP_MS = 500

/** Valor guardado fora da faixa/passo (registro antigo, escrita manual) volta ao permitido. */
export function clampExternalDelay(ms: number): number {
  if (!Number.isFinite(ms)) return 0
  const stepped = Math.round(ms / EXTERNAL_DELAY_STEP_MS) * EXTERNAL_DELAY_STEP_MS
  return Math.max(-EXTERNAL_DELAY_LIMIT_MS, Math.min(EXTERNAL_DELAY_LIMIT_MS, stepped))
}
