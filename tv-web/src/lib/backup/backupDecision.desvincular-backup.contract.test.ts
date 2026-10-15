import { expect, it } from 'vitest'
import { nextBackupAction } from './backupDecision'

const counts = { favorites: 3, history: 10, progress: 2, categoryPreferences: 1, listPins: 1 }

// US2/AC1 + US3/AC1/AC5, FR-006/FR-009: o Atualizar nunca sobrescreve um backup que a pessoa ainda não decidiu restaurar.
it('o passo de backup só sobe quando não há backup pendente de decisão', () => {
  // TV recém-pareada (reinstalou/desvinculou) e o serviço tem backup: oferece, NÃO sobe (subir apagaria o backup).
  expect(nextBackupAction({ state: 'unknown', remote: { exists: true, createdAt: 10, counts } })).toBe('offer')
  // Sem backup no serviço: pode subir.
  expect(nextBackupAction({ state: 'unknown', remote: { exists: false } })).toBe('upload')
  // Não deu para perguntar: não arrisca.
  expect(nextBackupAction({ state: 'unknown', remote: 'unavailable' })).toBe('skip')
  // Oferta em aberto ("Agora não"): o Atualizar continua sem subir até a pessoa decidir.
  expect(nextBackupAction({ state: 'offered', remote: { exists: true, createdAt: 10, counts } })).toBe('skip')
  // Já decidido (restaurou, recusou com substituição ou nunca houve backup): sobe normalmente.
  expect(nextBackupAction({ state: 'settled' })).toBe('upload')
})
