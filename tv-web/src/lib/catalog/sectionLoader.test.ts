import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { listCategories, listChannels, storeCategories } from './catalogRepository'
import { loadSection } from './sectionLoader'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-section-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Painel',
    providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste',
    providerPassword: 'senha-teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

async function seedLive(): Promise<number[]> {
  return storeCategories(
    ['1', '2', '3'].map((id, i) => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'channel' as const,
      fetchMode: 'on_demand' as const,
      providerCategoryId: id,
      name: `Grupo ${id}`,
      order: i,
    })),
    database,
  )
}

/** Resposta em fluxo, cortada em pedaços pequenos (como a rede entrega). */
function streamed(body: unknown, pieceSize = 7): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += pieceSize) controller.enqueue(bytes.slice(i, i + pieceSize))
        controller.close()
      },
    }),
  )
}

const SECTION = [
  { stream_id: 11, name: 'Canal A', category_id: '1' },
  { stream_id: 12, name: 'Canal B', category_id: '1' },
  { stream_id: 21, name: 'Canal C', category_id: '2' },
  { stream_id: 31, name: 'Canal D', category_id: '3' },
  { stream_id: 99, name: 'De categoria não declarada', category_id: '77' },
]

describe('loadSection (feature 038, R0-3)', () => {
  it('um pedido da seção inteira (sem category_id) grava só as categorias pedidas, na ordem da fonte, avisando cada uma', async () => {
    const [c1, c2, c3] = await seedLive()
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => streamed(SECTION))
    const onCategory = vi.fn()

    const result = await loadSection(SOURCE_ID, 'channel', [c1, c2], { database, fetchImpl, onCategory, now: () => 500 })

    expect(result).toEqual({ outcome: 'done', written: [c1, c2] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain('action=get_live_streams')
    expect(url).not.toContain('category_id')
    expect(onCategory.mock.calls.map(([id]) => id)).toEqual([c1, c2])

    expect((await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['Canal A', 'Canal B'])
    expect((await listChannels(SOURCE_ID, 1, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['Canal C'])
    const categories = await listCategories(SOURCE_ID, 'channel', database)
    expect(categories.find((c) => c.id === c1)).toMatchObject({ itemsFetchedAt: 500, count: 2 })
    expect(categories.find((c) => c.id === c3)?.itemsFetchedAt).toBeUndefined() // não foi pedida
  })

  it('categoria pedida que a seção não traz fica gravada vazia (dado real: a fonte não tem itens nela)', async () => {
    const [c1, , c3] = await seedLive()
    const result = await loadSection(SOURCE_ID, 'channel', [c3], {
      database,
      fetchImpl: async () => streamed(SECTION.filter((item) => item.category_id !== '3')),
    })
    expect(result.outcome).toBe('done')
    const categories = await listCategories(SOURCE_ID, 'channel', database)
    expect(categories.find((c) => c.id === c3)).toMatchObject({ count: 0 })
    expect(categories.find((c) => c.id === c1)?.itemsFetchedAt).toBeUndefined()
  })

  it('espera o portão antes de gravar cada categoria', async () => {
    const [c1, c2] = await seedLive()
    const order: string[] = []
    await loadSection(SOURCE_ID, 'channel', [c1, c2], {
      database,
      fetchImpl: async () => streamed(SECTION),
      waitUntilAllowed: async () => {
        order.push('portão')
      },
      onCategory: (id) => order.push(`gravou ${id === c1 ? 1 : 2}`),
    })
    expect(order).toEqual(['portão', 'gravou 1', 'portão', 'gravou 2'])
  })

  it('falha de rede sai como resultado, sem gravar nada e sem expor a URL', async () => {
    const [c1] = await seedLive()
    const result = await loadSection(SOURCE_ID, 'channel', [c1], {
      database,
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch http://exemplo.test/player_api.php?username=usuario-teste&password=senha-teste')
      },
    })
    expect(result).toEqual({ outcome: 'failed', written: [] })
  })

  it('cancelado: propaga AbortError', async () => {
    const [c1] = await seedLive()
    const controller = new AbortController()
    controller.abort()
    await expect(
      loadSection(SOURCE_ID, 'channel', [c1], { database, fetchImpl: async () => streamed(SECTION), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
