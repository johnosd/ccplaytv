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

  // Feature 039 (T031, FR-013): a seção nunca fica inteira na memória do Worker.
  it('descarregando no preparo a cada 2 itens, grava o mesmo que sem preparo e não deixa sobra', async () => {
    const [c1, c2, c3] = await seedLive()
    // Categorias intercaladas, como chegam de um painel de verdade.
    const interleaved = [
      { stream_id: 11, name: 'A1', category_id: '1' },
      { stream_id: 21, name: 'B1', category_id: '2' },
      { stream_id: 12, name: 'A2', category_id: '1' },
      { stream_id: 31, name: 'C1', category_id: '3' },
      { stream_id: 13, name: 'A3', category_id: '1' },
      { stream_id: 22, name: 'B2', category_id: '2' },
      { stream_id: 14, name: 'A4', category_id: '1' },
    ]
    const bulkAdd = vi.spyOn(database.sectionStaging, 'bulkAdd')

    const result = await loadSection(SOURCE_ID, 'channel', [c1, c2, c3], {
      database,
      fetchImpl: async () => streamed(interleaved, 5),
      stageFlushItems: 2,
    })

    expect(result).toEqual({ outcome: 'done', written: [c1, c2, c3] })
    expect(bulkAdd).toHaveBeenCalled() // de fato passou pelo preparo
    expect((await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['A1', 'A2', 'A3', 'A4'])
    expect((await listChannels(SOURCE_ID, 1, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['B1', 'B2'])
    expect((await listChannels(SOURCE_ID, 2, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['C1'])
    expect(await database.sectionStaging.count()).toBe(0)
  })

  it('sobra de uma carga interrompida (app fechado no meio) não entra na próxima', async () => {
    const [c1] = await seedLive()
    await database.sectionStaging.add({
      sourceId: SOURCE_ID,
      categoryId: c1,
      items: [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', name: 'Velho', originalName: 'Velho', groupOrder: 0 }],
    })

    await loadSection(SOURCE_ID, 'channel', [c1], { database, fetchImpl: async () => streamed(SECTION), stageFlushItems: 1 })

    expect((await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['Canal A', 'Canal B'])
    expect(await database.sectionStaging.count()).toBe(0)
  })

  it('falha de rede no meio do fluxo apaga o preparo e não grava categoria pela metade', async () => {
    const [c1] = await seedLive()
    let sent = 0
    const failing = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          sent += 1
          if (sent === 1) controller.enqueue(new TextEncoder().encode('[{"stream_id":11,"name":"A","category_id":"1"},'))
          else controller.error(new TypeError('network'))
        },
      }),
    )

    const result = await loadSection(SOURCE_ID, 'channel', [c1], { database, fetchImpl: async () => failing, stageFlushItems: 1 })

    expect(result).toEqual({ outcome: 'failed', written: [] })
    expect(await database.sectionStaging.count()).toBe(0)
    expect(await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)).toEqual([])
  })

  it('descarregar no preparo também espera o portão (não compete com a categoria que a pessoa abre)', async () => {
    const [c1, c2, c3] = await seedLive()
    const order: string[] = []
    const realBulkAdd = database.sectionStaging.bulkAdd.bind(database.sectionStaging)
    vi.spyOn(database.sectionStaging, 'bulkAdd').mockImplementation(((...args: Parameters<typeof realBulkAdd>) => {
      order.push('preparo')
      return realBulkAdd(...args)
    }) as typeof realBulkAdd)

    await loadSection(SOURCE_ID, 'channel', [c1, c2, c3], {
      database,
      fetchImpl: async () => streamed(SECTION, 5),
      stageFlushItems: 1,
      waitUntilAllowed: async () => {
        order.push('portão')
      },
    })

    expect(order).toContain('preparo')
    order.forEach((step, index) => {
      if (step === 'preparo') expect(order[index - 1]).toBe('portão')
    })
  })

  it('cancelada no meio do fluxo: apaga o preparo antes de propagar o AbortError', async () => {
    const [c1, c2] = await seedLive()
    const controller = new AbortController()
    let calls = 0

    await expect(
      loadSection(SOURCE_ID, 'channel', [c1, c2], {
        database,
        fetchImpl: async () => streamed(SECTION, 5),
        stageFlushItems: 1,
        signal: controller.signal,
        waitUntilAllowed: async () => {
          calls += 1
          // A 1ª descarga acontece; na 2ª, a lista é trocada.
          if (calls === 2) controller.abort()
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(calls).toBeGreaterThanOrEqual(2)
    expect(await database.sectionStaging.count()).toBe(0)
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
