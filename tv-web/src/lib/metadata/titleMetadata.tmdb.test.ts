import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { storeCategories } from '../catalog/catalogRepository'
import { ensureTitleMetadata, TMDB_CACHE_MS } from './titleMetadata'
import { RATE_LIMIT_PAUSE_MS, readTmdbCredential, saveTmdbKey } from './tmdbKeyRepository'
import { storeProviderMetadata } from './titleMetadataStore'

/**
 * Feature 032, US3 — ramo TMDB de `ensureTitleMetadata` (casos além dos dois
 * contratos travados): id contraditório/morto, falhas de serviço sem laço,
 * provedor completo, fallback de idioma, série e validade do cache.
 */

const SOURCE_ID = 'fonte-1'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

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

type Route = (url: URL) => Response | Promise<Response> | undefined

/** `fetch` falso: `/3/authentication` sempre aceita; o resto vem das rotas do teste, senão 404. */
function fakeFetch(routes: Route[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/3/authentication') return json({ success: true })
    for (const route of routes) {
      const answer = route(url)
      if (answer) return answer
    }
    return json({ status_code: 34 }, 404)
  })
}

const tmdbCalls = (fetchImpl: ReturnType<typeof vi.fn>) =>
  fetchImpl.mock.calls.map((call) => new URL(String((call as unknown[])[0]))).filter((url) => url.hostname === 'api.themoviedb.org')

const movieDetail = (overrides: Record<string, unknown> = {}) => ({
  id: 603,
  title: 'Matrix',
  original_language: 'en',
  release_date: '1999-03-31',
  overview: 'Sinopse.',
  backdrop_path: '/bd.jpg',
  genres: [{ id: 1, name: 'Ação' }],
  runtime: 136,
  production_countries: [{ iso_3166_1: 'US' }],
  credits: { cast: [{ name: 'Keanu Reeves' }], crew: [{ job: 'Director', name: 'Lana Wachowski' }] },
  // O detalhe passou a pedir `videos` (feature 033): sem a chave, o registro contaria como anterior à 033 e seria repedido.
  videos: { results: [] },
  ...overrides,
})

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-title-tmdb-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function addMovie(extra: { year?: number; name?: string } = {}): Promise<number> {
  const name = extra.name ?? 'Matrix'
  return (await database.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name,
    originalName: name,
    groupOrder: 0,
    providerStreamId: '100',
    year: extra.year,
  })) as number
}

/** Provedor que só devolve `info` (sem `tmdb_id` por padrão) e o TMDB conforme as rotas. */
function panelAndTmdb(info: Record<string, unknown>, tmdbRoutes: Route[]) {
  return fakeFetch([(url) => (url.hostname === 'painel.test' ? json({ info, movie_data: {} }) : undefined), ...tmdbRoutes])
}

async function open(movieId: number, fetchImpl: ReturnType<typeof vi.fn>, now = NOW) {
  return ensureTitleMetadata(movieId, { database, now: () => now, fetchImpl: fetchImpl as unknown as typeof fetch })
}

describe('ensureTitleMetadata — TMDB (feature 032, US3)', () => {
  it('provedor completo: com chave o TMDB é consultado uma vez (035, D-002) e o provedor continua vencendo', async () => {
    const movieId = await addMovie({ year: 1999 })
    const complete = {
      plot: 'P',
      genre: 'G',
      duration_secs: 100,
      director: 'D',
      country: 'C',
      cast: 'A',
      backdrop_path: ['http://img.test/b.jpg'],
      // Trailer também conta como campo do provedor (feature 033): sem ele, o TMDB seria consultado.
      youtube_trailer: 'provTrail01',
      tmdb_id: 603,
    }
    const fetchImpl = panelAndTmdb(complete, [(url) => (url.pathname === '/3/movie/603' ? json(movieDetail({ overview: 'Do TMDB.' })) : undefined)])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    const before = tmdbCalls(fetchImpl).length

    const view = await open(movieId, fetchImpl)

    expect(tmdbCalls(fetchImpl).length).toBe(before + 1)
    expect(view.synopsis).toEqual({ value: 'P', origin: 'provider' })
  })

  it('tmdb_id com ano contraditório é descartado e vale a busca por título + ano (FR-019)', async () => {
    const movieId = await addMovie({ year: 2021, name: 'Duna' })
    const fetchImpl = panelAndTmdb({ tmdb_id: 999 }, [
      (url) => (url.pathname === '/3/movie/999' ? json(movieDetail({ id: 999, title: 'Outro', release_date: '1980-01-01' })) : undefined),
      (url) =>
        url.pathname === '/3/search/movie'
          ? json({ results: [{ id: 1, title: 'Duna', release_date: '2021-09-15' }] })
          : undefined,
      (url) => (url.pathname === '/3/movie/1' ? json(movieDetail({ id: 1, title: 'Duna', release_date: '2021-09-15', overview: 'Duna, 2021.' })) : undefined),
    ])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const view = await open(movieId, fetchImpl)

    const paths = tmdbCalls(fetchImpl).map((url) => url.pathname)
    expect(paths).toContain('/3/movie/999')
    expect(paths).toContain('/3/search/movie')
    expect(view.synopsis).toEqual({ value: 'Duna, 2021.', origin: 'tmdb' })
  })

  it('tmdb_id que o TMDB não conhece (404) e sem ano: "id morto" cacheado, sem nova chamada ao reabrir', async () => {
    const movieId = await addMovie() // sem ano
    const fetchImpl = panelAndTmdb({ tmdb_id: 4242 }, [])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const view = await open(movieId, fetchImpl)
    expect(view.synopsis).toBeUndefined()
    const row = (await database.titleMetadata.toArray())[0]
    expect(row.tmdb).toEqual({ status: 'dead_id', tmdbId: 4242 })

    const callsAfterFirst = fetchImpl.mock.calls.length
    await open(movieId, fetchImpl, NOW + 1000)
    // O provedor está fresco e o TMDB cacheado: nenhuma nova requisição.
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst)
  })

  it('401: estado vira "refused", nada é cacheado e nenhuma tentativa nova é feita até haver chave nova', async () => {
    const movieId = await addMovie({ year: 1999 })
    const fetchImpl = panelAndTmdb({ tmdb_id: 603 }, [(url) => (url.pathname === '/3/movie/603' ? json({}, 401) : undefined)])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    await open(movieId, fetchImpl)

    expect((await readTmdbCredential({ database }))?.state).toBe('refused')
    expect((await database.titleMetadata.toArray())[0].tmdbFetchedAt).toBeUndefined()
    const before = tmdbCalls(fetchImpl).length
    await open(movieId, fetchImpl, NOW + DAY * 2) // provedor vencido, mas o TMDB não é chamado de novo
    expect(tmdbCalls(fetchImpl).length).toBe(before)
  })

  it('429: liga a pausa; dentro dela nada é chamado; depois dela tenta de novo e, dando certo, volta a "connected"', async () => {
    const movieId = await addMovie({ year: 1999 })
    let limited = true
    const fetchImpl = panelAndTmdb({ tmdb_id: 603 }, [
      (url) => (url.pathname === '/3/movie/603' ? (limited ? json({}, 429) : json(movieDetail())) : undefined),
    ])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    await open(movieId, fetchImpl)
    expect(await readTmdbCredential({ database })).toMatchObject({ state: 'rate_limited', pausedUntil: NOW + RATE_LIMIT_PAUSE_MS })

    const during = tmdbCalls(fetchImpl).length
    await open(movieId, fetchImpl, NOW + RATE_LIMIT_PAUSE_MS - 1000)
    expect(tmdbCalls(fetchImpl).length).toBe(during)

    limited = false
    const view = await open(movieId, fetchImpl, NOW + RATE_LIMIT_PAUSE_MS + 1000)
    expect(view.genres).toEqual({ value: 'Ação', origin: 'tmdb' })
    expect((await readTmdbCredential({ database }))?.state).toBe('connected')
  })

  it('sem rede: estado "offline", nada cacheado, UMA tentativa por abertura e o detalhe nunca lança (sem laço)', async () => {
    const movieId = await addMovie({ year: 1999 })
    let down = false
    const fetchImpl = panelAndTmdb({ tmdb_id: 603 }, [
      (url) => {
        if (url.pathname === '/3/movie/603' && down) throw new TypeError(`Failed to fetch ${url.href}`)
        return url.pathname === '/3/movie/603' ? json(movieDetail()) : undefined
      },
    ])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    down = true

    await expect(open(movieId, fetchImpl)).resolves.toBeDefined()
    expect(tmdbCalls(fetchImpl).filter((url) => url.pathname === '/3/movie/603')).toHaveLength(1)
    expect((await readTmdbCredential({ database }))?.state).toBe('offline')
    expect((await database.titleMetadata.toArray())[0].tmdbFetchedAt).toBeUndefined()

    down = false
    const view = await open(movieId, fetchImpl, NOW + 1000)
    expect(view.genres?.origin).toBe('tmdb')
    expect((await readTmdbCredential({ database }))?.state).toBe('connected')
  })

  it('sinopse vazia em pt-BR: usa a do idioma original e diz qual idioma (FR-021)', async () => {
    const movieId = await addMovie({ year: 1999 })
    const fetchImpl = panelAndTmdb({ tmdb_id: 603 }, [
      (url) => {
        if (url.pathname !== '/3/movie/603') return undefined
        return url.searchParams.get('language') === 'pt-BR' ? json(movieDetail({ overview: '' })) : json({ overview: 'The story.' })
      },
    ])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const view = await open(movieId, fetchImpl)

    expect(view.synopsis).toEqual({ value: 'The story.', origin: 'tmdb', language: 'en' })
  })

  it('original em português e sem sinopse: não repete a chamada e a sinopse fica ausente', async () => {
    const movieId = await addMovie({ year: 1999 })
    const fetchImpl = panelAndTmdb({ tmdb_id: 603 }, [
      (url) => (url.pathname === '/3/movie/603' ? json(movieDetail({ overview: '', original_language: 'pt' })) : undefined),
    ])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const view = await open(movieId, fetchImpl)

    expect(view.synopsis).toBeUndefined()
    expect(tmdbCalls(fetchImpl).filter((url) => url.pathname === '/3/movie/603')).toHaveLength(1)
  })

  it('série sem tmdb_id: busca em /3/search/tv por first_air_date_year e preenche só o que falta', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', providerCategoryId: '20', name: 'Anime', order: 0 }],
      database,
    )
    const seriesId = (await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'series',
      name: 'Frieren',
      originalName: 'Frieren',
      groupOrder: 0,
      categoryId,
      seriesId: '200',
      year: 2023,
      // Episódios já frescos: só então `ensureTitleMetadata` pergunta ao provedor pela série.
      episodesFetchedAt: NOW - DAY / 24,
    })) as number
    const fetchImpl = fakeFetch([
      (url) => (url.hostname === 'painel.test' ? json({ info: { plot: 'Sinopse do provedor.' }, episodes: {} }) : undefined),
      (url) =>
        url.pathname === '/3/search/tv'
          ? json({ results: [{ id: 77, name: 'Frieren', first_air_date: '2023-09-29' }] })
          : undefined,
      (url) =>
        url.pathname === '/3/tv/77'
          ? json({ id: 77, name: 'Frieren', original_language: 'ja', first_air_date: '2023-09-29', overview: 'TMDB.', genres: [{ name: 'Animação' }], episode_run_time: [25], origin_country: ['JP'] })
          : undefined,
    ])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const view = await ensureTitleMetadata(seriesId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const search = tmdbCalls(fetchImpl).find((url) => url.pathname === '/3/search/tv')
    expect(search?.searchParams.get('first_air_date_year')).toBe('2023')
    expect(view.synopsis).toEqual({ value: 'Sinopse do provedor.', origin: 'provider' })
    expect(view.genres).toEqual({ value: 'Animação', origin: 'tmdb' })
    expect(view.durationSeconds).toEqual({ value: 1500, origin: 'tmdb' })
    expect(view.country?.origin).toBe('tmdb')
    expect(view.director).toBeUndefined() // o TMDB não tem direção no nível da série
  })

  it('série cujos episódios ainda serão buscados: nem o provedor nem o TMDB são chamados agora (o TMDB só completa o que o provedor não trouxe)', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', providerCategoryId: '20', name: 'Anime', order: 0 }],
      database,
    )
    const seriesId = (await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'series',
      name: 'Frieren',
      originalName: 'Frieren',
      groupOrder: 0,
      categoryId,
      seriesId: '200',
      year: 2023,
      // sem `episodesFetchedAt`: o `seriesLoader` ainda vai buscar e gravar a metadata da série
    })) as number
    const fetchImpl = fakeFetch([])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    const before = fetchImpl.mock.calls.length

    const view = await ensureTitleMetadata(seriesId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(view).toEqual({})
    expect(fetchImpl.mock.calls.length).toBe(before)
  })

  it('validade de 6 meses: dentro dela não consulta; passada, consulta de novo', async () => {
    const movieId = await addMovie({ year: 1999 })
    const fetchImpl = panelAndTmdb({ tmdb_id: 603 }, [(url) => (url.pathname === '/3/movie/603' ? json(movieDetail()) : undefined)])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    await open(movieId, fetchImpl)
    const afterFirst = tmdbCalls(fetchImpl).filter((url) => url.pathname === '/3/movie/603').length
    expect(afterFirst).toBe(1)

    await open(movieId, fetchImpl, NOW + TMDB_CACHE_MS - DAY)
    expect(tmdbCalls(fetchImpl).filter((url) => url.pathname === '/3/movie/603')).toHaveLength(1)

    await open(movieId, fetchImpl, NOW + TMDB_CACHE_MS + DAY)
    expect(tmdbCalls(fetchImpl).filter((url) => url.pathname === '/3/movie/603')).toHaveLength(2)
  })

  it('remover a chave depois limpa só a parte TMDB: o provedor continua na visão', async () => {
    const movieId = await addMovie({ year: 1999 })
    const record = (await database.channels.get(movieId))!
    await storeProviderMetadata(database, record, { synopsis: 'Do provedor.' }, 603, NOW)
    const fetchImpl = fakeFetch([(url) => (url.pathname === '/3/movie/603' ? json(movieDetail()) : undefined)])
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    const withTmdb = await open(movieId, fetchImpl)
    expect(withTmdb.genres?.origin).toBe('tmdb')

    const { removeTmdbKey } = await import('./tmdbKeyRepository')
    await removeTmdbKey({ database })
    const after = await open(movieId, fetchImpl, NOW + 1000)

    expect(after.synopsis).toEqual({ value: 'Do provedor.', origin: 'provider' })
    expect(after.genres).toBeUndefined()
  })
})
