import { expect, it } from 'vitest'
import { evaluateLocalTrial, LOCAL_TRIAL_MS, reconcileTrialStart } from './localTrial'

// US3/AC1-AC4, FR-020, FR-021, FR-022, SC-006 — o teste conta no aparelho, o relógio atrasado não dá dias e a âncora nunca estende
it('teste local de 7 dias: vale até o último instante, não ganha tempo com relógio atrasado e a âncora só encurta', () => {
  const start = 1_800_000_000_000
  expect(LOCAL_TRIAL_MS).toBe(7 * 24 * 60 * 60 * 1000)

  expect(evaluateLocalTrial({ startedAt: start, highWatermark: start, now: start + LOCAL_TRIAL_MS - 1 }))
    .toMatchObject({ allowed: true, reason: 'valid' })
  expect(evaluateLocalTrial({ startedAt: start, highWatermark: start, now: start + LOCAL_TRIAL_MS }))
    .toMatchObject({ allowed: false, reason: 'expired' })

  // Relógio voltado para antes do início: a marca d'água manda e o teste continua vencido.
  const rolledBack = evaluateLocalTrial({ startedAt: start, highWatermark: start + LOCAL_TRIAL_MS + 5, now: start + 10 })
  expect(rolledBack).toMatchObject({ allowed: false, reason: 'expired' })
  expect(rolledBack.trustedNow).toBe(start + LOCAL_TRIAL_MS + 5)

  // Âncora do serviço: vale o início mais antigo; ausente mantém o local; nunca adianta o fim.
  expect(reconcileTrialStart(start + 5_000, start)).toBe(start)
  expect(reconcileTrialStart(start, start + 5_000)).toBe(start)
  expect(reconcileTrialStart(start, undefined)).toBe(start)
})