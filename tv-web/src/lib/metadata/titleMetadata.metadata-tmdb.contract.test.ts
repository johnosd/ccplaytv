/**
 * Contrato da feature 032 (metadata do provedor + TMDB BYOK) — travado em
 * `sdd/specs/032-metadata-tmdb-integracoes/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/metadados-e-casamento.md` e `logic/chave-tmdb.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'

const PANEL_SOURCE_ID = 'fonte-painel'
const M3U_SOURCE_ID = 'fonte-m3u'
const PASSWORD = 'senha-secreta-123'
const TMDB_KEY = '0123456789abcdef0123456789abcdef' // formato v3: 32 hex
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)

const PANEL_SOURCE: SourceRecord = {
  id: PANEL_SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario-teste',
  providerPassword: PASSWORD,
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

const M3U_SOURCE: SourceRecord = {
  id: M3U_SOURCE_ID,
  type: 'm3u_url',
  displayName: 'Lista avulsa',
  m3uUrl: 'http://lista.test/filmes.m3u',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function urlOf(call: unknown[]): URL {
  const input = call[0]
  return new URL(input instanceof Request ? input.url : String(input))
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-meta-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.bulkAdd([PANEL_SOURCE, M3U_SOURCE])
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('ensureTitleMetadata — contrato da feature 032', () => {
  // US1/AC1, FR-001/FR-002/FR-003 (campos do provedor, obtidos ao abrir), SC-004 (cache sem nova chamada)
  it('filme de painel sem chave TMDB: um get_vod_info, campos com origem "provider", e reabrir não chama a rede de novo', async () => {
    const movieId = (await database.channels.add({
      sourceId: PANEL_SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Matrix',
      originalName: 'Matrix',
      groupOrder: 0,
      providerStreamId: '100',
      year: 1999,
    })) as number

    const fetchImpl = vi.fn(async () =>
      json({
        info: {
          tmdb_id: 603,
          plot: 'Um hacker descobre a verdade.',
          genre: 'Ação, Ficção científica',
          director: 'Lana Wachowski, Lilly Wachowski',
          cast: 'Keanu Reeves, Carrie-Anne Moss',
          country: 'United States of America',
          duration_secs: 8160,
          backdrop_path: ['http://img.painel.test/matrix-bd.jpg'],
        },
        movie_data: { stream_id: 100 },
      }),
    )
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    const view = await ensureTitleMetadata(movieId, options)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = urlOf(fetchImpl.mock.calls[0] as unknown[])
    expect(`${url.origin}${url.pathname}`).toBe('http://painel.test/player_api.php')
    expect(url.searchParams.get('action')).toBe('get_vod_info')
    expect(url.searchParams.get('vod_id')).toBe('100')

    expect(view.synopsis).toMatchObject({ value: 'Um hacker descobre a verdade.', origin: 'provider' })
    expect(view.synopsis?.language).toBeUndefined()
    expect(view.backdropUrl).toEqual({ value: 'http://img.painel.test/matrix-bd.jpg', origin: 'provider' })
    expect(view.genres).toEqual({ value: 'Ação, Ficção científica', origin: 'provider' })
    expect(view.director).toEqual({ value: 'Lana Wachowski, Lilly Wachowski', origin: 'provider' })
    expect(view.cast).toEqual({ value: 'Keanu Reeves, Carrie-Anne Moss', origin: 'provider' })
    expect(view.country).toEqual({ value: 'United States of America', origin: 'provider' })
    expect(view.durationSeconds).toEqual({ value: 8160, origin: 'provider' })

    const again = await ensureTitleMetadata(movieId, options)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(again).toEqual(view)
  })

  // US3/AC1, FR-007/FR-018/FR-019 (provedor vence, TMDB só preenche vazio, tmdb_id do provedor primeiro), FR-013 (chave só vai ao TMDB)
  it('com chave: TMDB preenche só o que o provedor deixou vazio, pelo tmdb_id do provedor, e a chave só vai ao TMDB', async () => {
    const movieId = (await database.channels.add({
      sourceId: PANEL_SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Matrix',
      originalName: 'Matrix',
      groupOrder: 0,
      providerStreamId: '100',
      year: 1999,
    })) as number

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'painel.test') {
        return json({ info: { tmdb_id: 603, plot: 'Sinopse do provedor.', backdrop_path: [] }, movie_data: { stream_id: 100 } })
      }
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/movie/603') {
        return json({
          id: 603,
          title: 'Matrix',
          original_language: 'en',
          release_date: '1999-03-31',
          overview: 'Sinopse do TMDB.',
          backdrop_path: '/matrix-tmdb.jpg',
          genres: [{ id: 28, name: 'Ação' }],
          runtime: 136,
          production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }],
          credits: { cast: [{ name: 'Keanu Reeves' }], crew: [{ job: 'Director', name: 'Lana Wachowski' }] },
        })
      }
      return json({ status_code: 34 }, 404)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    const saved = await saveTmdbKey(TMDB_KEY, options)
    expect(saved.ok).toBe(true)

    const view = await ensureTitleMetadata(movieId, options)

    expect(view.synopsis).toMatchObject({ value: 'Sinopse do provedor.', origin: 'provider' })
    expect(view.backdropUrl?.origin).toBe('tmdb')
    expect(view.backdropUrl?.value).toContain('/matrix-tmdb.jpg')
    expect(view.genres).toEqual({ value: 'Ação', origin: 'tmdb' })

    const calls = fetchImpl.mock.calls.map((call) => urlOf(call as unknown[]))
    expect(calls.some((url) => url.pathname === '/3/movie/603')).toBe(true)
    for (const [index, url] of calls.entries()) {
      const request = fetchImpl.mock.calls[index] as unknown[]
      const serialized = `${url.href} ${JSON.stringify(request[1] ?? {})}`
      if (url.hostname === 'api.themoviedb.org') {
        expect(serialized).not.toContain(PASSWORD)
      } else {
        expect(serialized).not.toContain(TMDB_KEY)
      }
    }
  })

  // US3/AC2, FR-020/FR-023, Constitution: "IA e Classificação Nunca Inventam Dados" (candidato ambíguo não enriquece; "sem correspondência" fica em cache)
  it('M3U sem tmdb_id: busca por título + ano; dois candidatos plausíveis não enriquecem, e reabrir não busca de novo', async () => {
    const movieId = (await database.channels.add({
      sourceId: M3U_SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Duna (2021) [LEG]',
      originalName: 'Duna (2021) [LEG]',
      groupOrder: 0,
    })) as number

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/search/movie') {
        return json({
          page: 1,
          total_results: 2,
          results: [
            { id: 1, title: 'Duna', release_date: '2021-09-15', overview: 'Uma.' },
            { id: 2, title: 'Duna', release_date: '2021-10-22', overview: 'Outra.' },
          ],
        })
      }
      return json({ status_code: 34 }, 404)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    expect((await saveTmdbKey(TMDB_KEY, options)).ok).toBe(true)
    const callsAfterKey = fetchImpl.mock.calls.length

    const view = await ensureTitleMetadata(movieId, options)

    const search = fetchImpl.mock.calls
      .slice(callsAfterKey)
      .map((call) => urlOf(call as unknown[]))
      .find((url) => url.pathname === '/3/search/movie')
    expect(search).toBeDefined()
    expect(search?.searchParams.get('query')).toBe('Duna')
    expect(view.synopsis).toBeUndefined()
    expect(view.backdropUrl).toBeUndefined()

    const callsAfterFirst = fetchImpl.mock.calls.length
    await ensureTitleMetadata(movieId, options)
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst)
  })
})
