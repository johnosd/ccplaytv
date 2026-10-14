import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivityGate } from './activityGate'
import type { PrefetchCategoryState } from './prefetchOrder'
import { createPrefetchScheduler, type PrefetchRunOutcome, type PrefetchSchedulerDeps } from './prefetchScheduler'

/**
 * Bug `abrir-app-nao-atualiza-todas-categorias`: a renovação que uma
 * atualização da lista pediu não espera silêncio de teclas — com a pessoa
 * navegando, o portão ficava fechado e o catálogo não se atualizava na sessão.
 * Player aberto continua pausando (FR-004), e a carga fria continua cedendo à
 * tecla (FR-003).
 */

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

const FETCHED = 500_000
const RENEW = 900_000

function scheduler(categories: PrefetchCategoryState[], extra: Partial<PrefetchSchedulerDeps> = {}) {
  const gate = createActivityGate()
  const runCategory = vi.fn(async (_sourceId: string, categoryId: number): Promise<PrefetchRunOutcome> => {
    categories.find((c) => c.id === categoryId)!.itemsFetchedAt = Date.now()
    return 'done'
  })
  const instance = createPrefetchScheduler({
    loadCategories: async () => categories.map((category) => ({ ...category })),
    runCategory,
    gate,
    idleAfterKeyMs: 2000,
    gapMs: 500,
    ...extra,
  })
  return { gate, runCategory, instance }
}

/** Mantém uma tecla a cada segundo — a pessoa navegando sem parar. */
async function navigate(gate: ReturnType<typeof createActivityGate>, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    gate.noteKey(Date.now())
    await vi.advanceTimersByTimeAsync(1000)
  }
}

describe('renovação pedida por uma atualização', () => {
  it('renova com a pessoa navegando, sem esperar silêncio de teclas', async () => {
    const categories: PrefetchCategoryState[] = [
      { id: 1, kind: 'movie', order: 0, fetchMode: 'on_demand', itemsFetchedAt: FETCHED, renewRequestedAt: RENEW },
    ]
    const { gate, runCategory, instance } = scheduler(categories)
    gate.noteKey(Date.now())
    instance.start('fonte-1')

    await navigate(gate, 3000)
    expect(runCategory).toHaveBeenCalledWith('fonte-1', 1)
    instance.stop()
  })

  it('com o player aberto, espera fechar mesmo sendo urgente', async () => {
    const categories: PrefetchCategoryState[] = [
      { id: 1, kind: 'movie', order: 0, fetchMode: 'on_demand', itemsFetchedAt: FETCHED, renewRequestedAt: RENEW },
    ]
    const { gate, runCategory, instance } = scheduler(categories)
    const release = gate.acquirePlayback()
    instance.start('fonte-1')

    await vi.advanceTimersByTimeAsync(10_000)
    expect(runCategory).not.toHaveBeenCalled()

    release()
    await vi.advanceTimersByTimeAsync(100)
    expect(runCategory).toHaveBeenCalledWith('fonte-1', 1)
    instance.stop()
  })

  it('carga fria (nada pedido por atualização) continua cedendo à tecla', async () => {
    const categories: PrefetchCategoryState[] = [{ id: 1, kind: 'movie', order: 0, fetchMode: 'on_demand' }]
    const { gate, runCategory, instance } = scheduler(categories)
    gate.noteKey(Date.now())
    instance.start('fonte-1')

    await navigate(gate, 5000)
    expect(runCategory).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2500)
    expect(runCategory).toHaveBeenCalledWith('fonte-1', 1)
    instance.stop()
  })

  it('a carga por seção recebe `urgent` numa renovação e não na carga fria', async () => {
    const renewing: PrefetchCategoryState[] = [
      { id: 1, kind: 'movie', order: 0, fetchMode: 'on_demand', itemsFetchedAt: FETCHED, renewRequestedAt: RENEW },
      { id: 2, kind: 'movie', order: 1, fetchMode: 'on_demand', itemsFetchedAt: FETCHED, renewRequestedAt: RENEW },
    ]
    const runSection = vi.fn<NonNullable<PrefetchSchedulerDeps['runSection']>>(async (_s, _k, ids) => {
      for (const id of ids) renewing.find((c) => c.id === id)!.itemsFetchedAt = Date.now()
      return 'done'
    })
    const { gate, instance } = scheduler(renewing, { runSection })
    gate.noteKey(Date.now())
    instance.start('fonte-1')
    await navigate(gate, 2000)
    expect(runSection).toHaveBeenCalledTimes(1)
    expect(runSection.mock.calls[0][3].urgent).toBe(true)
    instance.stop()

    const cold: PrefetchCategoryState[] = [
      { id: 3, kind: 'movie', order: 0, fetchMode: 'on_demand' },
      { id: 4, kind: 'movie', order: 1, fetchMode: 'on_demand' },
    ]
    const coldSection = vi.fn<NonNullable<PrefetchSchedulerDeps['runSection']>>(async () => 'done')
    const second = scheduler(cold, { runSection: coldSection })
    second.instance.start('fonte-2')
    await vi.advanceTimersByTimeAsync(100)
    expect(coldSection).toHaveBeenCalledTimes(1)
    expect(coldSection.mock.calls[0][3].urgent).toBe(false)
    second.instance.stop()
  })
})
