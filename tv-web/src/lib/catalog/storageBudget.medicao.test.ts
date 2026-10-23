import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'

const emitted = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('../perf/metricsChannel', () => ({ emitMetric: (line: Record<string, unknown>) => { emitted.push(line) } }))

import { makeRoomFor, probeBudget } from './storageBudget'

let database: CatalogDb

beforeEach(async () => {
  emitted.length = 0
  database = new CatalogDb(`budget-medicao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: 'ativa', type: 'provider_credentials', displayName: 'a', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await database.delete()
})

describe('makeRoomFor — medição por etapa (feature 085/082, só no build de medição)', () => {
  it('com o canal ligado emite uma linha budget só com números e o modo, com as etapas do orçamento', async () => {
    vi.stubEnv('VITE_CCPLAY_METRICS_REPORT', 'http://127.0.0.1:8770/app-metrics')
    await makeRoomFor('ativa', 1000, { database, mode: 'prefetch' })
    expect(emitted).toHaveLength(1)
    const line = emitted[0]
    expect(line.source).toBe('budget')
    expect(line.mode).toBe('prefetch')
    for (const key of ['ledgerMs', 'ledgerReadMs', 'estimateMs', 'candidatesMs', 'totalMs', 'categories', 'sources']) expect(Number.isFinite(line[key] as number)).toBe(true)
  })

  it('sem o canal (build normal) não mede nem emite', async () => {
    vi.stubEnv('VITE_CCPLAY_METRICS_REPORT', '')
    await makeRoomFor('ativa', 1000, { database, mode: 'prefetch' })
    expect(emitted).toHaveLength(0)
  })

  it('probeBudget mede sem gravar nem liberar nada, e só com o canal ligado', async () => {
    await database.sectionStaging.add({ sourceId: 'outra', categoryId: 1, items: [] })
    await probeBudget(database)
    expect(emitted).toHaveLength(0)
    vi.stubEnv('VITE_CCPLAY_METRICS_REPORT', 'http://127.0.0.1:8770/app-metrics')
    await probeBudget(database)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].mode).toBe('probe')
    expect(await database.sectionStaging.count()).toBe(1)
  })
})
