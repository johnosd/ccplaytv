import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivityGate } from './activityGate'
import type { PrefetchCategoryState } from './prefetchOrder'
import { createPrefetchScheduler, RATE_LIMIT_PAUSE_MS, type PrefetchRunOutcome } from './prefetchScheduler'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Agendador da pré-carga — contrato da feature 042', () => {
  // US3/AC2, FR-017, SC-007: 429 do painel pausa por RATE_LIMIT_PAUSE_MS, sem contar como tentativa, e retoma sozinho.
  it('um 429 pausa a pré-carga pela espera inteira, mostra o motivo e retoma a MESMA categoria sozinho', async () => {
    const categories: PrefetchCategoryState[] = [
      { id: 1, kind: 'channel', order: 0, fetchMode: 'on_demand' },
      { id: 2, kind: 'channel', order: 1, fetchMode: 'on_demand' },
    ]
    const outcomes: PrefetchRunOutcome[] = ['rate_limited', 'done', 'done']
    const runCategory = vi.fn(async (_sourceId: string, categoryId: number) => {
      const outcome = outcomes.shift() ?? 'done'
      if (outcome === 'done') categories.find((category) => category.id === categoryId)!.itemsFetchedAt = Date.now()
      return outcome
    })
    const scheduler = createPrefetchScheduler({
      loadCategories: async () => categories.map((category) => ({ ...category })),
      runCategory,
      gate: createActivityGate(),
      idleAfterKeyMs: 2000,
      gapMs: 500,
    })

    scheduler.start('fonte-1')
    await vi.advanceTimersByTimeAsync(100)
    expect(runCategory).toHaveBeenCalledTimes(1)
    expect(runCategory).toHaveBeenLastCalledWith('fonte-1', 1)

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_PAUSE_MS - 2000)
    expect(runCategory).toHaveBeenCalledTimes(1) // nenhuma outra categoria durante a espera
    expect(scheduler.getProgress().pausedReason).toBe('rate_limited')

    await vi.advanceTimersByTimeAsync(3000)
    // Emenda aprovada (R-013): com `gapMs` a categoria 2 também pode já ter rodado nesta janela;
    // o que o contrato prova é que a RETOMADA é da mesma categoria que o painel limitou.
    expect(runCategory.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(runCategory).toHaveBeenNthCalledWith(2, 'fonte-1', 1) // a que o painel limitou volta primeiro: o 429 não é tentativa
    expect(scheduler.getProgress().pausedReason).toBeUndefined()

    scheduler.stop()
  })
})
