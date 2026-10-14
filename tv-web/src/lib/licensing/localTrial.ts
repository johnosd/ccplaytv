/**
 * Teste de 7 dias contado no aparelho (feature 071, FR-020..FR-022): sem rede, sem ganhar tempo com o
 * relógio atrasado, e nunca estendido pela âncora do serviço.
 */
import type { PlaybackAccessDecision } from './playbackAccess'

export const LOCAL_TRIAL_MS = 7 * 24 * 60 * 60 * 1000

export interface LocalTrialInput {
  /** Instante da primeira abertura (ms desde epoch), já reconciliado com a âncora do serviço. */
  startedAt: number
  /** Maior instante já observado neste aparelho (nunca diminui). */
  highWatermark: number
  /** Relógio atual do aparelho. */
  now: number
}

export interface LocalTrialDecision {
  allowed: boolean
  reason: 'valid' | 'expired' | 'invalid'
  /** `max(now, highWatermark)`. */
  trustedNow: number
  expiresAt: number
}

const isTime = (value: number) => Number.isFinite(value) && value >= 0

export function evaluateLocalTrial(input: LocalTrialInput): LocalTrialDecision {
  const { startedAt, highWatermark, now } = input
  if (!isTime(startedAt) || !isTime(highWatermark) || !isTime(now)) {
    // Dado corrompido nunca libera: o teste local falha fechado.
    return { allowed: false, reason: 'invalid', trustedNow: 0, expiresAt: 0 }
  }
  const trustedNow = Math.max(now, highWatermark)
  const expiresAt = startedAt + LOCAL_TRIAL_MS
  return trustedNow < expiresAt
    ? { allowed: true, reason: 'valid', trustedNow, expiresAt }
    : { allowed: false, reason: 'expired', trustedNow, expiresAt }
}

/** O serviço nunca estende: vale o início mais antigo entre o local e o ancorado (ausente = só o local). */
export function reconcileTrialStart(local: number, server: number | undefined): number {
  if (server === undefined || !Number.isSafeInteger(server) || server <= 0) return local
  return Math.min(local, server)
}

/**
 * 071/D-005: acesso = licença assinada válida OU teste local vigente; `revoked` assinado vence o teste.
 * `license` ausente = nenhuma licença verificada no aparelho.
 */
export function decideAccess(license: PlaybackAccessDecision | undefined, trial: LocalTrialDecision | undefined): PlaybackAccessDecision {
  if (license?.reason === 'revoked') return license
  if (license?.allowed) return license
  if (trial?.allowed) return { allowed: true, reason: 'valid' }
  if (license) return license
  if (trial) return { allowed: false, reason: trial.reason === 'invalid' ? 'invalid' : 'expired' }
  return { allowed: false, reason: 'not_activated' }
}
