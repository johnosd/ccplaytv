/**
 * Contrato da feature 033 (trailers) — travado em
 * `sdd/specs/033-trailers-filmes-series/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/candidatos-de-trailer.md` §3–§5 (onde cada fonte é lida).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'

const PANEL_SOURCE_ID = 'fonte-painel'
const TMDB_KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)

const PANEL_SOURCE: SourceRecord = {
  id: PANEL_SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-secreta-123',
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
  database = new CatalogDb(`test-trailer-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL_SOURCE)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('ensureTitleMetadata — trailers, contrato da feature 033', () => {
  // FR-002/FR-003/FR-004/FR-005, SC-004 (nada de rede a mais ao reabrir)
  it('filme: youtube_trailer do provedor é o 1º candidato; os vídeos do TMDB vêm na MESMA chamada do detalhe (videos, com português) e entram depois, sem repetir; reabrir não chama a rede', async () => {
    const movieId = (await database.channels.add({
      sourceId: PANEL_SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Duna',
      originalName: 'Duna',
      groupOrder: 0,
      providerStreamId: '100',
      year: 2021,
    })) as number

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'painel.test') {
        return json({
          info: { tmdb_id: 438631, plot: 'Sinopse do provedor.', youtube_trailer: 'provTrail01', backdrop_path: [] },
          movie_data: { stream_id: 100 },
        })
      }
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/movie/438631') {
        return json({
          id: 438631,
          title: 'Duna',
          original_language: 'en',
          release_date: '2021-09-15',
          overview: 'Sinopse do TMDB.',
          backdrop_path: '/duna.jpg',
          genres: [],
          credits: { cast: [], crew: [] },
          videos: {
            results: [
              { site: 'YouTube', type: 'Trailer', key: 'provTrail01', iso_639_1: 'en', official: true },
              { site: 'YouTube', type: 'Trailer', key: 'trailerPt01', iso_639_1: 'pt', official: true },
            ],
          },
        })
      }
      return json({ status_code: 34 }, 404)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    expect((await saveTmdbKey(TMDB_KEY, options)).ok).toBe(true)
    const callsAfterKey = fetchImpl.mock.calls.length

    const view = await ensureTitleMetadata(movieId, options)

    expect(view.trailers?.map((c) => [c.videoId, c.origin])).toEqual([
      ['provTrail01', 'provider'],
      ['trailerPt01', 'tmdb'],
    ])

    const tmdbCalls = fetchImpl.mock.calls
      .slice(callsAfterKey)
      .map((call) => urlOf(call as unknown[]))
      .filter((url) => url.hostname === 'api.themoviedb.org')
    const movieCalls = tmdbCalls.filter((url) => url.pathname.startsWith('/3/movie/'))
    expect(movieCalls).toHaveLength(1)
    expect(movieCalls[0].pathname).toBe('/3/movie/438631')
    expect(movieCalls[0].searchParams.get('append_to_response')?.split(',')).toEqual(
      expect.arrayContaining(['credits', 'videos']),
    )
    expect(movieCalls[0].searchParams.get('include_video_language')?.split(',')).toContain('pt')

    const callsAfterFirst = fetchImpl.mock.calls.length
    const again = await ensureTitleMetadata(movieId, options)
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst)
    expect(again.trailers).toEqual(view.trailers)
  })
})
