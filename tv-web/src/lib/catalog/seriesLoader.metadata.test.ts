import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listEpisodes, storeCategories } from './catalogRepository'
import { ensureSeriesEpisodes } from './seriesLoader'

/**
 * Feature 032 (D-009/FR-028): a mesma resposta de `get_series_info` serve aos
 * episódios, à metadata da série e à sinopse de cada episódio — uma
 * requisição só.
 */

const SOURCE_ID = 'fonte-1'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)

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

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-series-meta-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

async function seedSeries(): Promise<number> {
  await database.sources.add(PROVIDER_SOURCE)
  const [categoryId] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', providerCategoryId: '20', name: 'Comédia', order: 0 }],
    database,
  )
  return (await database.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'series',
    name: 'Frieren',
    originalName: 'Frieren',
    groupOrder: 0,
    categoryId,
    seriesId: '200',
  })) as number
}

describe('seriesLoader — metadata e sinopse de episódio (feature 032)', () => {
  it('uma única requisição grava os episódios (com a sinopse de cada um) E a metadata da série', async () => {
    const seriesRecordId = await seedSeries()
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          info: { plot: 'Uma maga elfa.', genre: 'Animação', cast: 'A, B', backdrop_path: ['http://img.test/s.jpg'], episode_run_time: '25' },
          episodes: {
            '1': [
              { id: '1001', episode_num: 1, title: 'Piloto', container_extension: 'mp4', info: { plot: 'Sinopse do piloto.' } },
              { id: '1002', episode_num: 2, title: 'Segundo', container_extension: 'mp4', info: { plot: '   ' } },
              { id: '1003', episode_num: 3, title: 'Terceiro', container_extension: 'mp4' },
            ],
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => NOW })

    expect(result.outcome).toBe('fetched')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const episodes = await listEpisodes(SOURCE_ID, '200', database)
    const bySynopsis = Object.fromEntries(episodes.map((episode) => [episode.name, episode.synopsis]))
    expect(bySynopsis).toEqual({ Piloto: 'Sinopse do piloto.', Segundo: undefined, Terceiro: undefined })

    const metadata = await database.titleMetadata.toArray()
    expect(metadata).toHaveLength(1)
    expect(metadata[0]).toMatchObject({
      sourceId: SOURCE_ID,
      kind: 'series',
      providerFetchedAt: NOW,
      provider: { synopsis: 'Uma maga elfa.', genres: 'Animação', cast: 'A, B', durationSeconds: 1500 },
    })
    expect(metadata[0].providerTmdbId).toBeUndefined()
  })

  it('falha ao gravar a metadata da série não derruba a obtenção dos episódios', async () => {
    const seriesRecordId = await seedSeries()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ info: { plot: 'X' }, episodes: { '1': [{ id: '1', episode_num: 1, title: 'Ep' }] } }), { status: 200 }),
      ),
    )
    vi.spyOn(database.titleMetadata, 'put').mockRejectedValue(new Error('quota'))

    const result = await ensureSeriesEpisodes(seriesRecordId, { database, now: () => NOW })

    expect(result.outcome).toBe('fetched')
    expect(await listEpisodes(SOURCE_ID, '200', database)).toHaveLength(1)
  })
})
