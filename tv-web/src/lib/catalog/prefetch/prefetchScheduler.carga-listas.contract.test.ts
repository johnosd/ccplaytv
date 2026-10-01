import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivityGate } from './activityGate'
import type { PrefetchCategoryState } from './prefetchOrder'
import { createPrefetchScheduler, type PrefetchRunOutcome } from './prefetchScheduler'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Agendador da pré-carga — contrato da feature 038', () => {
  // FR-002 (uma por vez), FR-003 (espera ~2 s sem tecla), FR-004 (nada começa com player aberto;
  // retoma sozinho ao fechar), FR-006 (relê o disco: não refaz o que ficou pronto), SC-004, US1-AC3/AC5.
  it('uma categoria por vez, só depois de 2 s sem tecla, nunca com player aberto, e retoma sozinho', async () => {
    const categories: PrefetchCategoryState[] = [
      { id: 1, kind: 'channel', order: 0, fetchMode: 'on_demand' },
      { id: 2, kind: 'channel', order: 1, fetchMode: 'on_demand' },
      { id: 3, kind: 'channel', order: 2, fetchMode: 'on_demand' },
    ]
    const pending: Array<(outcome: PrefetchRunOutcome) => void> = []
    const runCategory = vi.fn((_sourceId: string, categoryId: number) =>
      new Promise<PrefetchRunOutcome>((resolve) => {
        pending.push((outcome) => {
          const category = categories.find((c) => c.id === categoryId)!
          category.itemsFetchedAt = Date.now()
          resolve(outcome)
        })
      }),
    )
    const gate = createActivityGate()
    const scheduler = createPrefetchScheduler({
      loadCategories: async () => categories.map((category) => ({ ...category })),
      runCategory,
      gate,
      idleAfterKeyMs: 2000,
      gapMs: 500,
    })

    gate.noteKey(Date.now())
    scheduler.start('fonte-1')

    await vi.advanceTimersByTimeAsync(1500)
    expect(runCategory).not.toHaveBeenCalled() // ainda dentro dos 2 s da última tecla

    await vi.advanceTimersByTimeAsync(1000)
    expect(runCategory).toHaveBeenCalledTimes(1)
    expect(runCategory).toHaveBeenLastCalledWith('fonte-1', 1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory).toHaveBeenCalledTimes(1) // nunca duas ao mesmo tempo

    const releasePlayback = gate.acquirePlayback()
    pending.shift()!('done')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runCategory).toHaveBeenCalledTimes(1) // player aberto: nenhuma categoria nova começa

    releasePlayback()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runCategory).toHaveBeenCalledTimes(2)
    expect(runCategory).toHaveBeenLastCalledWith('fonte-1', 2) // a 1 ficou pronta: não é refeita

    scheduler.stop()
    pending.shift()!('done')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runCategory).toHaveBeenCalledTimes(2) // parado: não começa a 3
  })
})
