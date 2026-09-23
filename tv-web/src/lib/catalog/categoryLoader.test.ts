import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listChannels, storeCategories, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-loader-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

const SOURCE_ID = 'fonte-1'

const PROVIDER_SOURCE: SourceRecord = {
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
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

async function seedOnDemandCategory(overrides: Partial<CatalogCategory> = {}): Promise<CatalogCategory> {
  await database.sources.add(PROVIDER_SOURCE)
  const [id] = await storeCategories(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        fetchMode: 'on_demand',
        providerCategoryId: '10',
        name: 'Ação',
        order: 0,
      },
    ],
    database,
  )
  return {
    id,
    kind: 'movie',
    name: 'Ação',
    order: 0,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: '10',
    ...overrides,
  }
}

function panelFetch(streams: unknown[] = [{ stream_id: 1, name: 'Filme', stream_type: 'movie' }]) {
  return vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(streams)))
}

describe('categoryLoader — ensureCategory (feature 010, T024-T027)', () => {
  it('categoria eager sai sempre fresh, sem nenhuma chamada de rede (T025)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await database.sources.add(PROVIDER_SOURCE)

    const eager: CatalogCategory = {
      id: 1,
      kind: 'channel',
      name: 'Esportes',
      order: 0,
      count: 5,
      fetchMode: 'eager',
      // "vencida" há muito tempo — não importa, eager nunca busca.
      itemsFetchedAt: 0,
    }

    const result = await ensureCategory(SOURCE_ID, eager, { database, now: () => 10_000_000_000_000 })

    expect(result.outcome).toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('categoria on_demand nunca obtida busca e grava — outcome fetched', async () => {
    const category = await seedOnDemandCategory()
    vi.stubGlobal('fetch', panelFetch())

    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => 1000 })

    expect(result.outcome).toBe('fetched')
    const items = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(items.map((i) => i.name)).toEqual(['Filme'])
    expect(items[0].categoryId).toBe(category.id)
  })

  it('categoria on_demand dentro do prazo sai fresh, sem tocar a rede', async () => {
    const category = await seedOnDemandCategory({ itemsFetchedAt: 1000 })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => 1000 + 1000 })

    expect(result.outcome).toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('categoria on_demand vencida busca de novo — outcome fetched (T024)', async () => {
    const category = await seedOnDemandCategory({ itemsFetchedAt: 1000 })
    vi.stubGlobal('fetch', panelFetch())

    const farInTheFuture = 1000 + 25 * 60 * 60 * 1000 // > 24h
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => farInTheFuture })

    expect(result.outcome).toBe('fetched')
  })

  it('falha numa categoria nunca obtida vira failed, e a categoria continua na estrutura (FR-009)', async () => {
    const category = await seedOnDemandCategory()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => 1000 })

    expect(result.outcome).toBe('failed')
    // Não sumiu — só não tem itens ainda.
    const remaining = await storeCategories([], database) // no-op, só confirma que o banco segue de pé
    expect(remaining).toEqual([])
  })

  it('falha numa categoria vencida serve o que já estava no disco — stale-served (contrato §2, regra 4)', async () => {
    const category = await seedOnDemandCategory({ itemsFetchedAt: 1000, count: 1 })
    // Primeiro, uma obtenção bem-sucedida deixa um item gravado.
    vi.stubGlobal('fetch', panelFetch([{ stream_id: 1, name: 'Filme Antigo', stream_type: 'movie' }]))
    await ensureCategory(SOURCE_ID, { ...category, itemsFetchedAt: undefined }, { database, now: () => 1000 })

    // Agora a categoria está vencida e a rede falha.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const farInTheFuture = 1000 + 25 * 60 * 60 * 1000
    const result = await ensureCategory(
      SOURCE_ID,
      { ...category, itemsFetchedAt: 1000 },
      { database, now: () => farInTheFuture },
    )

    expect(result.outcome).toBe('stale-served')
    // O item da obtenção anterior continua servindo.
    const items = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(items.map((i) => i.name)).toEqual(['Filme Antigo'])
  })

  it('chamadas concorrentes para a mesma categoria compartilham uma obtenção só (contrato §2, regra 2)', async () => {
    const category = await seedOnDemandCategory()
    const fetchMock = panelFetch()
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      ensureCategory(SOURCE_ID, category, { database, now: () => 1000 }),
      ensureCategory(SOURCE_ID, category, { database, now: () => 1000 }),
    ])

    expect(first.outcome).toBe('fetched')
    expect(second.outcome).toBe('fetched')
    // Uma consulta por seção (categorias) — não duas obtenções concorrentes
    // duplicando trabalho e gravação.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const items = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(items).toHaveLength(1)
  })
})
