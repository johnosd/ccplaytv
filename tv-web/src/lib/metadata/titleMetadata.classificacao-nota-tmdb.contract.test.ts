/**
 * Contrato da feature 061 (classificação indicativa e nota TMDB) — travado em
 * `sdd/specs/061-classificacao-nota-tmdb/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/classificacao-e-nota.md` §4 e §5.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'
import { PROVIDER_FIELDS_VERSION, titleStableId } from './titleMetadataStore'

const SOURCE_ID = 'fonte-061'
const TMDB_KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0)
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
  database = new CatalogDb(`test-061-meta-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(SOURCE)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('ensureTitleMetadata — contrato da feature 061', () => {
  // FR-001, FR-002, FR-003, FR-014, SC-001, US1/AC6; Constitution: "Foco Visível e Sem Becos Sem Saída" (nenhuma consulta fora do abrir)
  it('registro TMDB gravado antes da 061 é consultado UMA vez ao abrir, na mesma chamada de detalhe (com release_dates), e guarda BR/US/ES e a nota; reabrir não consulta', async () => {
    const record = {
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie' as const,
      name: 'Matrix',
      originalName: 'Matrix',
      groupOrder: 0,
      providerStreamId: '100',
      year: 1999,
    }
    const movieId = (await database.channels.add(record)) as number

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/movie/603') {
        return json({
          id: 603,
          title: 'Matrix',
          original_language: 'en',
          release_date: '1999-03-31',
          overview: 'Sinopse do TMDB.',
          vote_average: 8.2,
          vote_count: 26000,
          credits: { cast: [], crew: [] },
          videos: { results: [] },
          recommendations: { results: [] },
          similar: { results: [] },
          release_dates: {
            results: [
              { iso_3166_1: 'BR', release_dates: [{ certification: '14', type: 3 }] },
              { iso_3166_1: 'US', release_dates: [{ certification: 'R', type: 3 }] },
              { iso_3166_1: 'ES', release_dates: [{ certification: '18', type: 3 }] },
            ],
          },
        })
      }
      return json({ status_code: 34 }, 404)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }
    expect((await saveTmdbKey(TMDB_KEY, options)).ok).toBe(true)

    // Provedor fresco e TMDB `matched` de antes da 061 (já com os campos da 033 e da 035), dentro dos 6 meses.
    await database.titleMetadata.put({
      stableId: titleStableId(record) as string,
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { synopsis: 'Do provedor.' },
      providerFetchedAt: NOW - DAY / 2,
      providerVersion: PROVIDER_FIELDS_VERSION,
      providerTmdbId: 603,
      tmdb: { status: 'matched', tmdbId: 603, fields: { synopsis: 'Antiga.', trailerVideos: [], similar: [] }, language: 'pt' },
      tmdbFetchedAt: NOW - DAY,
    })

    const before = fetchImpl.mock.calls.length
    const view = await ensureTitleMetadata(movieId, options)

    const calls = fetchImpl.mock.calls.slice(before).map((call) => urlOf(call as unknown[]))
    expect(calls.map((url) => url.pathname)).toEqual(['/3/movie/603'])
    expect(calls[0].searchParams.get('append_to_response')?.split(',')).toEqual(expect.arrayContaining(['release_dates', 'credits', 'videos']))
    expect(view.certifications).toEqual({ BR: '14', US: 'R', ES: '18' })
    expect(view.tmdbRating).toEqual({ average: 8.2, votes: 26000 })

    const afterRefresh = fetchImpl.mock.calls.length
    const again = await ensureTitleMetadata(movieId, options)
    expect(fetchImpl.mock.calls.length).toBe(afterRefresh)
    expect(again.certifications).toEqual({ BR: '14', US: 'R', ES: '18' })
  })
})
