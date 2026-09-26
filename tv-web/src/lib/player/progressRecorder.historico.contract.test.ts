/**
 * Contrato da feature 019 (Histórico e Continuar Assistindo) — limiar de
 * conclusão automática de FILME, distinto do de episódio (feature 012).
 *
 * Seletor fixado por este contrato (fonte de verdade — `logic/
 * agregacao-serie.md` não repete isto em prosa): `ProgressRecorderOptions.
 * completionRatio`, repassado a `isPastEnd` dentro de `apply()`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../catalog/db'
import { getUserState } from '../catalog/userStateRepository'
import { createProgressRecorder, type ProgressRecorderIdentity } from './progressRecorder'
import { MOVIE_WATCHED_RATIO } from './resumePolicy'

const IDENTITY: ProgressRecorderIdentity = { stableId: 'src1|movie|id:100', sourceId: 'src1' }

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// Nota: FR-002 (onExit('completed') marca assistido) e FR-003 (sem avanço
// nunca grava nada) já são satisfeitos hoje por `recordCompletion`/FR-017
// (feature 012), independente de `completionRatio` — não precisam de
// contrato novo aqui; ficam cobertos pelos "Testes da fase" (não travados)
// quando `PlayerLayer.tsx` passar a ligar `recordCompletion` para filme.
// Só o AC1 (limiar de 90%, abaixo do que hoje é fixo em 95%) depende de
// código que ainda não existe.
describe('progressRecorder — limiar de filme (feature 019)', () => {
  beforeEach(async () => {
    await db.userStates.clear()
  })

  it('filme cruza 90% da duração: marca assistido e apaga a retomada (US1 AC1, FR-001)', async () => {
    const recorder = createProgressRecorder(IDENTITY, true, undefined, {
      recordCompletion: true,
      completionRatio: MOVIE_WATCHED_RATIO,
    })

    recorder.onProgress(901_000, 1_000_000) // 90,1% de 1_000_000ms — cruzou 90%, não cruzou 95%

    await flush()
    const state = await getUserState(IDENTITY.stableId)
    expect(state?.completedAt).toBeDefined()
    expect(state?.progressSeconds).toBeUndefined()
  })
})
