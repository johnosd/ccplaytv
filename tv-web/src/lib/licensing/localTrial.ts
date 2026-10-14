/**
 * Teste de 7 dias contado no aparelho (feature 071, FR-020..FR-022): sem rede, sem ganhar tempo com o
 * relógio atrasado, e nunca estendido pela âncora do serviço. STUB do sdd-plan — implementar na T004.
 */
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

export function evaluateLocalTrial(_input: LocalTrialInput): LocalTrialDecision {
  throw new Error('not implemented')
}

/** O serviço nunca estende: vale o início mais antigo entre o local e o ancorado (ausente = só o local). */
export function reconcileTrialStart(_local: number, _server: number | undefined): number {
  throw new Error('not implemented')
}