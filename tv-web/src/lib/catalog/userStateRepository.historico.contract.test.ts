/**
 * Contrato da feature 019 (Histórico e Continuar Assistindo) — correção
 * manual de "assistido" (D-004).
 *
 * Seletor fixado por este contrato: `setWatchedManually(stableId, sourceId,
 * watched, database?)`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { getUserState, setWatchedManually } from './userStateRepository'

const STABLE_ID = 'src1|movie|id:100'
const SOURCE_ID = 'src1'

describe('setWatchedManually (feature 019, US2, FR-004/FR-005)', () => {
  beforeEach(async () => {
    await db.userStates.clear()
  })

  it('marca e desmarca um filme, sem inventar posição nem duração (US2 AC1-2)', async () => {
    await setWatchedManually(STABLE_ID, SOURCE_ID, true)
    const marked = await getUserState(STABLE_ID)
    expect(marked?.completedAt).toBeDefined()
    expect(marked?.progressSeconds).toBeUndefined()

    await setWatchedManually(STABLE_ID, SOURCE_ID, false)
    const unmarked = await getUserState(STABLE_ID)
    expect(unmarked?.completedAt).toBeUndefined()
  })
})
