import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivityGate } from './activityGate'
import type { PrefetchCategoryState } from './prefetchOrder'
import { createPrefetchScheduler, type PrefetchRunOutcome, type PrefetchSchedulerDeps } from './prefetchScheduler'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

function channels(n: number): PrefetchCategoryState[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, kind: 'channel' as const, order: i, fetchMode: 'on_demand' as const }))
}

function setup(categories: PrefetchCategoryState[], overrides: Partial<PrefetchSchedulerDeps> = {}) {
  const gate = createActivityGate()
  const outcomes = new Map<number, PrefetchRunOutcome>()
  const runCategory = vi.fn(async (_sourceId: string, id: number) => {
    const outcome = outcomes.get(id) ?? 'done'
    if (outcome === 'done') categories.find((c) => c.id === id)!.itemsFetchedAt = Date.now()
    return outcome
  })
  const scheduler = createPrefetchScheduler({
    loadCategories: async () => categories.map((c) => ({ ...c })),
    runCategory,
    gate,
    gapMs: 100,
    ...overrides,
  })
  return { gate, scheduler, runCategory, outcomes }
}

describe('prefetchScheduler (feature 038)', () => {
  it('app oculto e sem rede pausam; ao voltar, retoma', async () => {
    const { gate, scheduler, runCategory } = setup(channels(2))
    gate.setHidden(true)
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory).not.toHaveBeenCalled()
    expect(scheduler.getProgress().state).toBe('paused')

    gate.setHidden(false)
    gate.setOnline(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory).not.toHaveBeenCalled()

    gate.setOnline(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(runCategory).toHaveBeenCalledTimes(2)
    expect(scheduler.getProgress()).toMatchObject({ state: 'done', ready: 2, total: 2 })
  })

  it('armazenamento cheio para de vez nesta sessão', async () => {
    const { scheduler, runCategory, outcomes } = setup(channels(3))
    outcomes.set(1, 'storage_full')
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory).toHaveBeenCalledTimes(1)
    expect(scheduler.getProgress()).toMatchObject({ state: 'stopped', stoppedReason: 'storage_full' })
  })

  it('falha vai para o fim e desiste depois de 3 tentativas', async () => {
    const { scheduler, runCategory, outcomes } = setup(channels(2))
    outcomes.set(1, 'failed')
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(5000)
    // 1ª tentativa na ordem normal; depois de falhar, só volta quando a 2 já foi.
    expect(runCategory.mock.calls.map(([, id]) => id)).toEqual([1, 2, 1, 1])
    expect(scheduler.getProgress().state).toBe('done')
  })

  it('`prioritize` passa na frente da ordem normal, mesmo depois de terminar', async () => {
    const categories = channels(3)
    const { scheduler, runCategory } = setup(categories)
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory).toHaveBeenCalledTimes(3)

    categories[1].itemsFetchedAt = Date.now() - 25 * 60 * 60 * 1000 // vencida
    categories[2].itemsFetchedAt = Date.now() - 25 * 60 * 60 * 1000
    scheduler.prioritize(3)
    await vi.advanceTimersByTimeAsync(50)
    expect(runCategory.mock.calls.at(3)?.[1]).toBe(3)
  })

  it('trocar de lista zera as falhas e passa a buscar só a nova', async () => {
    const { scheduler, runCategory, outcomes } = setup(channels(1))
    outcomes.set(1, 'failed')
    scheduler.start('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory).toHaveBeenCalledTimes(3)
    scheduler.start('b')
    await vi.advanceTimersByTimeAsync(5000)
    expect(runCategory.mock.calls.filter(([source]) => source === 'b')).toHaveLength(3)
  })

  it('seção com várias categorias a obter vai num pedido só; o que sobra segue por categoria (R0-3)', async () => {
    const categories: PrefetchCategoryState[] = [
      ...channels(3),
      { id: 10, kind: 'movie', order: 0, fetchMode: 'on_demand' },
    ]
    const runSection = vi.fn(async (_s: string, _k: string, ids: number[], options: { onCategory: (id: number) => void }) => {
      for (const id of ids) {
        categories.find((c) => c.id === id)!.itemsFetchedAt = Date.now()
        options.onCategory(id)
      }
      return 'done' as const
    })
    const onCategoryDone = vi.fn()
    const { scheduler, runCategory } = setup(categories, { runSection, onCategoryDone })
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(5000)

    expect(runSection).toHaveBeenCalledTimes(1)
    expect(runSection.mock.calls[0].slice(1, 3)).toEqual(['channel', [1, 2, 3]])
    expect(onCategoryDone.mock.calls.map(([, id]) => id)).toEqual([1, 2, 3, 10])
    // Filmes tinha só 1 categoria: não vale a seção inteira.
    expect(runCategory.mock.calls.map(([, id]) => id)).toEqual([10])
  })

  it('a seção da dica vem primeiro; parar cancela a seção em andamento', async () => {
    const categories: PrefetchCategoryState[] = [
      ...channels(2),
      { id: 10, kind: 'movie', order: 0, fetchMode: 'on_demand' },
      { id: 11, kind: 'movie', order: 1, fetchMode: 'on_demand' },
    ]
    let seenSignal: AbortSignal | undefined
    const runSection = vi.fn(
      (_s: string, _k: string, _ids: number[], options: { signal: AbortSignal }) =>
        new Promise<'done'>(() => {
          seenSignal = options.signal
        }),
    )
    const { scheduler } = setup(categories, { runSection })
    scheduler.setHint({ kind: 'movie' })
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(1000)
    expect(runSection.mock.calls[0][1]).toBe('movie')
    scheduler.stop()
    expect(seenSignal?.aborted).toBe(true)
  })

  it('limpeza em partes roda entre categorias e quando não há mais nada, só com o portão aberto', async () => {
    let batches = 3
    const housekeeping = vi.fn(async () => {
      batches -= 1
      return batches > 0
    })
    const { scheduler, gate } = setup(channels(1), { housekeeping })
    scheduler.start('f')
    await vi.advanceTimersByTimeAsync(5000)
    // 1 depois da categoria + 2 com nada a fazer (a última diz "acabou").
    expect(housekeeping).toHaveBeenCalledTimes(3)

    // Com o portão fechado, nada de limpeza (nem na releitura periódica).
    batches = 3
    gate.acquirePlayback()
    scheduler.wake()
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
    expect(housekeeping).toHaveBeenCalledTimes(3)
  })
})
