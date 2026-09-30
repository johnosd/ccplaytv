import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { storeCategories } from '../catalog/catalogRepository'
import { ensureTitleMetadata, mergeTitleMetadata } from './titleMetadata'
import { storeProviderMetadata } from './titleMetadataStore'

const SOURCE_ID = 'fonte-1'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)
const HOUR = 60 * 60 * 1000

const PANEL: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario',
  providerPassword: 'senha',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-title-meta-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function addMovie(extra: Partial<{ providerStreamId: string }> = { providerStreamId: '100' }): Promise<number> {
  return (await database.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name: 'Matrix',
    originalName: 'Matrix',
    groupOrder: 0,
    ...extra,
  })) as number
}

/**
 * `episodesFetchedAt`: quando definido e fresco, os episódios já foram buscados
 * (e a metadata não) — o único caso em que `ensureTitleMetadata` pergunta sozinho
 * pela série; senão quem pergunta é o `seriesLoader`, na mesma resposta dos episódios.
 */
async function addOnDemandSeries(
  fetchMode: 'on_demand' | 'eager' | 'stored' = 'on_demand',
  episodesFetchedAt?: number,
): Promise<number> {
  const [categoryId] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode, providerCategoryId: '20', name: 'Comédia', order: 0 }],
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
    episodesFetchedAt,
  })) as number
}

describe('ensureTitleMetadata — caminho do provedor (feature 032, US1)', () => {
  it('série cujos episódios ainda serão buscados: NÃO pergunta ao provedor (o seriesLoader traz tudo na mesma resposta)', async () => {
    const seriesId = await addOnDemandSeries('on_demand', undefined)
    const fetchImpl = vi.fn()

    const view = await ensureTitleMetadata(seriesId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(view).toEqual({})
  })

  it('série com episódios frescos e sem metadata (aberta antes desta feature): get_series_info uma vez, sem país e sem tmdb_id, duração por episódio', async () => {
    const seriesId = await addOnDemandSeries('on_demand', NOW - HOUR)
    const fetchImpl = vi.fn(async () =>
      json({ info: { plot: 'Uma maga elfa.', genre: 'Animação', episode_run_time: '25', backdrop_path: ['http://img.test/s.jpg'] }, episodes: {} }),
    )

    const view = await ensureTitleMetadata(seriesId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(new URL(String((fetchImpl.mock.calls[0] as unknown[])[0])).searchParams.get('action')).toBe('get_series_info')
    expect(view.synopsis?.value).toBe('Uma maga elfa.')
    expect(view.durationSeconds?.value).toBe(1500)
    expect(view.country).toBeUndefined()
  })

  it('metadata já gravada pelo seriesLoader e fresca: nenhuma chamada', async () => {
    const seriesId = await addOnDemandSeries('on_demand', NOW - HOUR)
    const record = (await database.channels.get(seriesId))!
    await storeProviderMetadata(database, record, { synopsis: 'Do cache.' }, undefined, NOW - HOUR)
    const fetchImpl = vi.fn()

    const view = await ensureTitleMetadata(seriesId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(view.synopsis).toEqual({ value: 'Do cache.', origin: 'provider' })
  })

  it('vencida (> 24 h): pergunta de novo e substitui o que o provedor tinha', async () => {
    const movieId = await addMovie()
    const record = (await database.channels.get(movieId))!
    await storeProviderMetadata(database, record, { synopsis: 'Velha.' }, undefined, NOW - 25 * HOUR)
    const fetchImpl = vi.fn(async () => json({ info: { plot: 'Nova.' } }))

    const view = await ensureTitleMetadata(movieId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(view.synopsis?.value).toBe('Nova.')
  })

  it('provedor falhando: devolve o que havia, nunca lança, e NÃO avança a validade (FR-006)', async () => {
    const movieId = await addMovie()
    const record = (await database.channels.get(movieId))!
    await storeProviderMetadata(database, record, { synopsis: 'Guardada.' }, undefined, NOW - 25 * HOUR)
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch http://painel.test/player_api.php?username=usuario&password=senha')
    })

    const view = await ensureTitleMetadata(movieId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(view.synopsis?.value).toBe('Guardada.')
    expect((await database.titleMetadata.toArray())[0].providerFetchedAt).toBe(NOW - 25 * HOUR)
  })

  it('duas chamadas simultâneas para o mesmo título compartilham uma só requisição (FR-025)', async () => {
    const movieId = await addMovie()
    let release: (response: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    const first = ensureTitleMetadata(movieId, options)
    const second = ensureTitleMetadata(movieId, options)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    release(json({ info: { plot: 'Única.' } }))

    expect((await first).synopsis?.value).toBe('Única.')
    expect((await second).synopsis?.value).toBe('Única.')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sem como perguntar ao provedor (filme sem id do painel, série M3U eager/stored, fonte M3U avulsa): zero rede e visão vazia', async () => {
    const noId = await addMovie({})
    const eagerSeries = await addOnDemandSeries('eager')
    const fetchImpl = vi.fn()
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    expect(await ensureTitleMetadata(noId, options)).toEqual({})
    expect(await ensureTitleMetadata(eagerSeries, options)).toEqual({})

    await database.sources.put({ ...PANEL, id: 'm3u', type: 'm3u_url', m3uUrl: 'http://lista.test/a.m3u', providerDns: undefined })
    const m3uMovie = (await database.channels.add({
      sourceId: 'm3u',
      generation: 1,
      kind: 'movie',
      name: 'Duna',
      originalName: 'Duna',
      groupOrder: 0,
    })) as number
    expect(await ensureTitleMetadata(m3uMovie, options)).toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('id inexistente, canal ou item sem identidade estável: visão vazia, sem lançar', async () => {
    const channelId = (await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'channel',
      name: 'Globo',
      originalName: 'Globo',
      groupOrder: 0,
    })) as number
    expect(await ensureTitleMetadata(999999, { database })).toEqual({})
    expect(await ensureTitleMetadata(channelId, { database })).toEqual({})
    expect(await ensureTitleMetadata(Number.NaN, { database })).toEqual({})
  })
})

describe('mergeTitleMetadata (D-003: provedor vence, TMDB só preenche vazio)', () => {
  it('cada campo vem do provedor quando existe, senão do TMDB, senão ausente', () => {
    const view = mergeTitleMetadata(
      { synopsis: 'P', genres: 'Terror' },
      { status: 'matched', tmdbId: 1, fields: { synopsis: 'T', synopsisLanguage: 'en', backdropUrl: 'http://t/b.jpg', genres: 'Drama', cast: 'A, B' } },
    )
    expect(view.synopsis).toEqual({ value: 'P', origin: 'provider' })
    expect(view.genres).toEqual({ value: 'Terror', origin: 'provider' })
    expect(view.backdropUrl).toEqual({ value: 'http://t/b.jpg', origin: 'tmdb' })
    expect(view.cast).toEqual({ value: 'A, B', origin: 'tmdb' })
    expect(view.director).toBeUndefined()
  })

  it('sinopse do TMDB em idioma original carrega o idioma; "sem correspondência" não acrescenta nada', () => {
    expect(mergeTitleMetadata(undefined, { status: 'matched', tmdbId: 1, fields: { synopsis: 'T', synopsisLanguage: 'en' } }).synopsis).toEqual({
      value: 'T',
      origin: 'tmdb',
      language: 'en',
    })
    expect(mergeTitleMetadata({ synopsis: 'P' }, { status: 'no_match' })).toEqual({
      synopsis: { value: 'P', origin: 'provider' },
      tmdbMatch: 'no_match',
    })
    expect(mergeTitleMetadata(undefined, undefined)).toEqual({})
  })
})
