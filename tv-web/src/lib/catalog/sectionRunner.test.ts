import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { storeCategories } from './catalogRepository'

const emitted = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('../perf/metricsChannel', () => ({ emitMetric: (line: Record<string, unknown>) => { emitted.push(line) } }))

import { runSectionLoad } from './sectionRunner'

beforeEach(async () => {
  emitted.length = 0
  await db.open()
  await db.sources.add({ id: 'fonte-1', type: 'provider_credentials', displayName: 'Painel', providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste', providerPassword: 'senha-teste', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

describe('runSectionLoad (feature 085)', () => {
  it('na thread principal emite uma linha section-load só com números e rótulos', async () => {
    // O banco padrão do app é o que `loadSection` usa quando o runner não recebe um.
    const [category] = await storeCategories([{ sourceId: 'fonte-1', generation: 1, kind: 'channel', fetchMode: 'on_demand',
      providerCategoryId: '1', name: 'Grupo Secreto', order: 0 }], db)
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([{ stream_id: 1, name: 'Canal do Provedor', category_id: '1' }])))
    const outcome = await runSectionLoad('fonte-1', 'channel', [category], { isBlocked: () => false, mainThread: true })
    expect(outcome).toBe('done')
    expect(emitted).toHaveLength(1)
    const line = emitted[0]
    expect(line.source).toBe('section-load')
    expect(line.kind).toBe('channel')
    expect(line.outcome).toBe('done')
    expect(line.items).toBe(1)
    expect(JSON.stringify(line)).not.toMatch(/Canal do Provedor|Grupo Secreto|exemplo\.test|senha-teste/)
  })
})
