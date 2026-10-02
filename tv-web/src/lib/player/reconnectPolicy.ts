/**
 * Política de reconexão do stream (feature 042, `logic/rede-e-lifecycle.md` §3).
 * As constantes são as decisões D-003 do plano (os contratos as importam —
 * não mudar valores sem emendar o contrato).
 */

/** Esperas antes da 1ª, 2ª e 3ª tentativa automática — no máximo 3 (FR-008). */
export const RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000] as const

/** O contador de tentativas só zera depois deste tempo ininterrupto em `playing`. */
export const RECONNECT_STABLE_MS = 30_000

export type ReconnectDecision = { action: 'retry'; delayMs: number } | { action: 'give-up' }

/**
 * `attempt` = quantas tentativas automáticas já foram feitas desde o último
 * período estável. Só reconecta quando o diagnóstico permite (`autoReconnect`)
 * e há rede (`online`).
 */
export function nextReconnect({
  attempt,
  online,
  autoReconnect,
}: {
  attempt: number
  online: boolean
  autoReconnect: boolean
}): ReconnectDecision {
  if (!autoReconnect || !online) return { action: 'give-up' }
  if (attempt < 0 || attempt >= RECONNECT_DELAYS_MS.length) return { action: 'give-up' }
  return { action: 'retry', delayMs: RECONNECT_DELAYS_MS[attempt] }
}
