import { expect, it } from 'vitest'
import type { UserStateRecord } from '../catalog/db'
import { PENDING_RESTORE_TTL_MS, planRestore } from './usageMerge'

const state = (sourceId: string, id: string, updatedAt: number, extra: Partial<UserStateRecord> = {}): UserStateRecord => ({
  stableId: `${sourceId}:movie:${id}`, sourceId, isFavorite: false, createdAt: 1, updatedAt, ...extra })

// US3/AC2-AC4, FR-008/FR-010/FR-011: cada dado volta à sua lista; união com o mais recente; lista ausente vira pendente por 5 dias.
it('restaurar mescla por lista + identidade lógica, mantém o local mais novo e guarda o que é de lista ausente', () => {
  const now = 1_000_000
  const plan = planRestore({
    now,
    existingSourceIds: ['s1'],
    local: { userStates: [state('s1', 'a', 100, { isFavorite: true, favoritedAt: 100 })], categoryPreferences: [], listPins: [] },
    backup: {
      userStates: [
        state('s1', 'a', 50, { progressSeconds: 10, lastWatched: 50 }), // mais velho que o local: não volta
        state('s1', 'b', 70, { isFavorite: true, favoritedAt: 70 }), // só no backup: volta
        state('s2', 'c', 60, { lastWatched: 60 }), // lista ausente: pendente
      ],
      categoryPreferences: [], listPins: [], settings: {},
    },
  })

  expect(plan.apply.userStates.map((row) => row.stableId)).toEqual(['s1:movie:b'])
  expect(plan.pending).toHaveLength(1)
  expect(plan.pending[0]).toMatchObject({ sourceId: 's2', expiresAt: now + PENDING_RESTORE_TTL_MS })
  expect(plan.pending[0].userStates.map((row) => row.stableId)).toEqual(['s2:movie:c'])
})
