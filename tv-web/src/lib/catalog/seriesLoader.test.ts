import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listEpisodes, storeCategories } from './catalogRepository'
import { ensureSeriesEpisodes } from './seriesLoader'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-series-loader-${Math.random().toString(36).slice(2)}`)
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

/** `get_series_info` com dois episódios, por padrão — mesmo formato real do painel. */
function panelSeriesInfoFetch(
  episodes: Record<string, unknown> = {
    '1': [
      { id: '1001', episode_num: 1, title: 'Piloto', container_extension: 'mp4' },
      { id: '1002', episode_num: 2, title: 'Segundo', container_extension: 'mp4' },
    ],
  },
) {
  return vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ episodes })))
}

/** Grava a fonte, a categoria `on_demand` de séries e o registro da própria série. Devolve o id local da série. */
async function seedOnDemandSeries(overrides: { categoryFetchMode?: 'on_demand' | 'eager' } = {}): Promise<number> {
  await database.sources.add(PROVIDER_SOURCE)
  const [categoryId] = await storeCategories(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'series',
        fetchMode: overrides.categoryFetchMode ?? 'on_demand',
        providerCategoryId: '20',
        name: 'Comédia',
        order: 0,
      },
    ],
    database,
  )
  const [seriesRecordId] = await database.channels.bulkAdd(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'series',
        name: 'The Office',
        originalName: 'The Office',
        groupOrder: 0,
        categoryId,
        seriesId: '200',
      },
    ],
    { allKeys: true },
  )
  return seriesRecordId as number
}

/**
 * Grava a fonte, a categoria `stored` (feature 014) de séries, e a própria
 * série JÁ COM os episódios em `channels` — simula o estado que
 * `categoryLoader.ts` deixa depois de ler a categoria (D-006): série e
 * episódios chegam juntos, nunca por esta função.
 */
async function seedStoredSeriesWithEpisodes(): Promise<number> {
  const m3uSource: SourceRecord = {
    id: SOURCE_ID,
    type: 'm3u_url',
    displayName: 'Lista Avulsa',
    m3uUrl: 'http://exemplo.test/lista.m3u',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  }
  await database.sources.add(m3uSource)
  const [categoryId] = await storeCategories(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'series',
        fetchMode: 'stored',
        name: 'Séries',
        order: 0,
        declaredCount: 1,
      },
    ],
    database,
  )
  // `itemsFetchedAt`/`itemsCount` só existem depois da leitura real da
  // categoria (`storeStoredCategory`) — aqui simula esse estado já feito.
  await database.categories.update(categoryId, { itemsFetchedAt: 1000, itemsCount: 1 })
  const [seriesRecordId] = await database.channels.bulkAdd(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'series',
        name: 'Breaking Bad',
        originalName: 'Breaking Bad',
        groupOrder: 0,
        categoryId,
        seriesId: 'm3u:Séries|breaking bad',
      },
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'episode',
        name: 'Breaking Bad S01E01',
        originalName: 'Breaking Bad S01E01',
        groupOrder: 0,
        seriesId: 'm3u:Séries|breaking bad',
        seasonNumber: 1,
        episodeNumber: 1,
      },
    ],
    { allKeys: true },
  )
  return seriesRecordId as number
}

describe('seriesLoader — ensureSeriesEpisodes (feature 012)', () => {
  it('série de categoria eager sai sempre fresh, sem nenhuma chamada de rede', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const seriesRecordId = await seedOnDemandSeries({ categoryFetchMode: 'eager' })

    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    expect(result.outcome).toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('série de categoria stored (feature 014) sai sempre fresh, sem rede — episódios já vieram da leitura da categoria', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const seriesRecordId = await seedStoredSeriesWithEpisodes()

    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    expect(result.outcome).toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled()
    const episodes = await listEpisodes(SOURCE_ID, 'm3u:Séries|breaking bad', database)
    expect(episodes.map((e) => e.name)).toEqual(['Breaking Bad S01E01'])
  })

  it('série on_demand nunca obtida busca e grava — outcome fetched, sem nenhum episódio com URL', async () => {
    const seriesRecordId = await seedOnDemandSeries()
    vi.stubGlobal('fetch', panelSeriesInfoFetch())

    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    expect(result.outcome).toBe('fetched')
    const episodes = await listEpisodes(SOURCE_ID, '200', database)
    expect(episodes.map((e) => e.name).sort()).toEqual(['Piloto', 'Segundo'])
    expect(episodes.every((e) => e.directUrl === undefined)).toBe(true)
  })

  it('série on_demand dentro do prazo (24h) sai fresh, sem tocar a rede', async () => {
    const seriesRecordId = await seedOnDemandSeries()
    vi.stubGlobal('fetch', panelSeriesInfoFetch())
    await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 + 1000 })

    expect(result.outcome).toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('série on_demand vencida (>24h) busca de novo — outcome fetched', async () => {
    const seriesRecordId = await seedOnDemandSeries()
    vi.stubGlobal('fetch', panelSeriesInfoFetch())
    await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    vi.stubGlobal('fetch', panelSeriesInfoFetch())
    const farInTheFuture = 1000 + 25 * 60 * 60 * 1000
    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => farInTheFuture })

    expect(result.outcome).toBe('fetched')
  })

  it('falha numa série nunca obtida vira failed, sem lançar', async () => {
    const seriesRecordId = await seedOnDemandSeries()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    expect(result.outcome).toBe('failed')
  })

  it('falha numa série vencida serve o que já estava no disco — stale-served, episódios antigos preservados', async () => {
    const seriesRecordId = await seedOnDemandSeries()
    vi.stubGlobal('fetch', panelSeriesInfoFetch())
    await ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const farInTheFuture = 1000 + 25 * 60 * 60 * 1000
    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => farInTheFuture })

    expect(result.outcome).toBe('stale-served')
    const episodes = await listEpisodes(SOURCE_ID, '200', database)
    expect(episodes.map((e) => e.name).sort()).toEqual(['Piloto', 'Segundo'])
  })

  it('chamadas concorrentes para a mesma série compartilham uma obtenção só', async () => {
    const seriesRecordId = await seedOnDemandSeries()
    const fetchMock = panelSeriesInfoFetch()
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 }),
      ensureSeriesEpisodes(seriesRecordId, { database, now: () => 1000 }),
    ])

    expect(first.outcome).toBe('fetched')
    expect(second.outcome).toBe('fetched')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const episodes = await listEpisodes(SOURCE_ID, '200', database)
    expect(episodes).toHaveLength(2)
  })

  it('série inexistente ou sem seriesId vira failed, sem lançar', async () => {
    const result = await ensureSeriesEpisodes(999, { database, now: () => 1000 })
    expect(result.outcome).toBe('failed')
  })
})
