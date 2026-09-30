/**
 * Contrato da feature 035 (Semelhantes e elenco com foto na MESMA consulta do
 * detalhe) — travado em `sdd/specs/035-semelhantes-elenco-ator/contract-tests.lock`.
 * O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/semelhantes-e-elenco-tmdb.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'
import { PROVIDER_FIELDS_VERSION, titleStableId } from './titleMetadataStore'

const SOURCE_ID = 'fonte-painel'
const TMDB_KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

const SOURCE: SourceRecord = {
  id: SOURCE_ID,
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
  database = new CatalogDb(`test-035-meta-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(SOURCE)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('ensureTitleMetadata — contrato da feature 035', () => {
  // FR-002/FR-003/FR-004/FR-013, SC-005; amplia a FR-018 da 032 (D-002 do plan.md)
  it('com chave, mesmo com o provedor completo: uma consulta TMDB traz Semelhantes (recomendações primeiro, sem repetir, sem o próprio) e elenco com foto; reabrir não chama; registro TMDB anterior à 035 é consultado de novo uma vez', async () => {
    const matrixId = (await database.channels.add({
      sourceId: SOURCE_ID,
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
        // Provedor com TODOS os campos da 032 + trailer: pela regra da 032 o TMDB nem seria consultado.
        return json({
          info: {
            tmdb_id: 603,
            plot: 'Sinopse do provedor.',
            genre: 'Ação',
            director: 'Lana Wachowski',
            cast: 'Keanu Reeves, Laurence Fishburne',
            country: 'Estados Unidos',
            duration_secs: 8160,
            backdrop_path: ['http://img.painel.test/matrix-bd.jpg'],
            youtube_trailer: 'vKQi3bBA1y8',
          },
          movie_data: { stream_id: 100 },
        })
      }
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/movie/603') {
        return json({
          id: 603,
          title: 'Matrix',
          original_language: 'en',
          release_date: '1999-03-31',
          overview: 'Sinopse do TMDB.',
          credits: {
            cast: [
              { id: 6384, name: 'Keanu Reeves', character: 'Neo', profile_path: '/keanu.jpg', order: 0 },
              { id: 2975, name: 'Laurence Fishburne', character: 'Morpheus', profile_path: null, order: 1 },
            ],
            crew: [],
          },
          videos: { results: [] },
          recommendations: {
            results: [
              { id: 604, title: 'Matrix Reloaded', original_title: 'The Matrix Reloaded', release_date: '2003-05-15', poster_path: '/reloaded.jpg', overview: 'Neo continua.' },
              { id: 603, title: 'Matrix', release_date: '1999-03-31' },
            ],
          },
          similar: {
            results: [
              { id: 604, title: 'Matrix Reloaded', release_date: '2003-05-15' },
              { id: 605, title: 'Matrix Revolutions', release_date: '2003-11-05', poster_path: null },
            ],
          },
        })
      }
      if (url.pathname === '/3/movie/1637') {
        return json({ id: 1637, title: 'Velocidade Máxima', release_date: '1994-06-09', credits: { cast: [], crew: [] }, videos: { results: [] }, recommendations: { results: [] }, similar: { results: [] } })
      }
      return json({ status_code: 34 }, 404)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }
    expect((await saveTmdbKey(TMDB_KEY, options)).ok).toBe(true)

    const view = await ensureTitleMetadata(matrixId, options)

    const detailCall = fetchImpl.mock.calls.map((call) => urlOf(call as unknown[])).find((url) => url.pathname === '/3/movie/603')
    expect(detailCall).toBeDefined()
    expect(detailCall?.searchParams.get('append_to_response')?.split(',')).toEqual(
      expect.arrayContaining(['credits', 'videos', 'recommendations', 'similar']),
    )
    expect(view.tmdbMatch).toBe('matched')
    expect(view.similar?.map((title) => [title.tmdbId, title.kind, title.year])).toEqual([
      [604, 'movie', 2003],
      [605, 'movie', 2003],
    ])
    expect(view.similar?.[0]).toMatchObject({ title: 'Matrix Reloaded', originalTitle: 'The Matrix Reloaded', overview: 'Neo continua.' })
    expect(view.similar?.[0].posterUrl).toContain('/reloaded.jpg')
    expect(view.similar?.[1].posterUrl).toBeUndefined()
    expect(view.castPeople?.map((person) => [person.personId, person.name, person.character])).toEqual([
      [6384, 'Keanu Reeves', 'Neo'],
      [2975, 'Laurence Fishburne', 'Morpheus'],
    ])
    expect(view.castPeople?.[0].photoUrl).toContain('/keanu.jpg')
    expect(view.castPeople?.[1].photoUrl).toBeUndefined()
    // O provedor continua vencendo nos campos da 032.
    expect(view.synopsis).toMatchObject({ value: 'Sinopse do provedor.', origin: 'provider' })

    const callsAfterFirst = fetchImpl.mock.calls.length
    await ensureTitleMetadata(matrixId, options)
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst)

    // Registro TMDB `matched` gravado antes da 035 (sem `similar`), ainda dentro dos 6 meses.
    const speedRecord = {
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie' as const,
      name: 'Velocidade Máxima',
      originalName: 'Velocidade Máxima',
      groupOrder: 0,
      providerStreamId: '200',
      year: 1994,
    }
    const speedId = (await database.channels.add(speedRecord)) as number
    const speedStableId = titleStableId(speedRecord) as string
    await database.titleMetadata.put({
      stableId: speedStableId,
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { synopsis: 'Do provedor.' },
      providerFetchedAt: NOW - DAY / 2,
      providerVersion: PROVIDER_FIELDS_VERSION,
      providerTmdbId: 1637,
      tmdb: { status: 'matched', tmdbId: 1637, fields: { synopsis: 'Antiga.', trailerVideos: [] } },
      tmdbFetchedAt: NOW - DAY,
    })
    const before = fetchImpl.mock.calls.length
    const speed = await ensureTitleMetadata(speedId, options)
    const speedCalls = fetchImpl.mock.calls.slice(before).map((call) => urlOf(call as unknown[]).pathname)
    expect(speedCalls).toEqual(['/3/movie/1637'])
    expect(speed.similar).toEqual([])

    const afterRefresh = fetchImpl.mock.calls.length
    await ensureTitleMetadata(speedId, options)
    expect(fetchImpl.mock.calls.length).toBe(afterRefresh)
  })
})
