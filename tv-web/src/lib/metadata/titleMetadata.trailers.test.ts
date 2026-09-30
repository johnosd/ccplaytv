import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord, type TitleMetadataRecord } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'
import { PROVIDER_FIELDS_VERSION, titleStableId } from './titleMetadataStore'

/**
 * Feature 033, D-005/D-006 — quando o trailer obriga a pedir de novo (casos
 * além do contrato travado): `matched` anterior à 033, `no_match`, versão
 * antiga do provedor.
 */

const SOURCE_ID = 'fonte-1'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)

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

const COMPLETE_PROVIDER = {
  synopsis: 'P',
  genres: 'G',
  durationSeconds: 100,
  director: 'D',
  country: 'C',
  cast: 'A',
  backdropUrl: 'http://img.test/b.jpg',
  trailerVideos: [{ videoId: 'provTrail01', kind: 'trailer' as const }],
}

let database: CatalogDb
let fetchImpl: ReturnType<typeof vi.fn>
let movieId: number

const urls = () => fetchImpl.mock.calls.map((call) => new URL(String((call as unknown[])[0])))
const panelCalls = () => urls().filter((url) => url.hostname === 'painel.test')
const tmdbMovieCalls = () => urls().filter((url) => url.pathname.startsWith('/3/movie/'))

async function seed(record: Partial<TitleMetadataRecord>) {
  const channel = (await database.channels.get(movieId))!
  await database.titleMetadata.put({
    stableId: titleStableId(channel)!,
    sourceId: SOURCE_ID,
    kind: 'movie',
    ...record,
  })
}

async function open(now = NOW) {
  return ensureTitleMetadata(movieId, { database, now: () => now, fetchImpl: fetchImpl as unknown as typeof fetch })
}

beforeEach(async () => {
  database = new CatalogDb(`test-trailers-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
  movieId = (await database.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name: 'Matrix',
    originalName: 'Matrix',
    groupOrder: 0,
    providerStreamId: '100',
    year: 1999,
  })) as number

  fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'painel.test') return json({ info: { plot: 'Do painel.', youtube_trailer: 'provTrail01' } })
    if (url.pathname === '/3/authentication') return json({ success: true })
    if (url.pathname === '/3/movie/603') {
      return json({
        id: 603,
        title: 'Matrix',
        original_language: 'en',
        release_date: '1999-03-31',
        overview: 'Sinopse.',
        credits: { cast: [], crew: [] },
        videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'trailerEn01', iso_639_1: 'en' }] },
      })
    }
    return json({ status_code: 34 }, 404)
  })
  await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
  fetchImpl.mockClear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('ensureTitleMetadata — quando o trailer obriga a pedir de novo (033)', () => {
  it('matched gravado antes da 033 (sem trailerVideos) é repedido UMA vez, mesmo dentro dos 6 meses', async () => {
    await seed({
      provider: COMPLETE_PROVIDER,
      providerFetchedAt: NOW,
      providerVersion: PROVIDER_FIELDS_VERSION,
      providerTmdbId: 603,
      tmdb: { status: 'matched', tmdbId: 603, fields: { synopsis: 'Antiga.' } },
      tmdbFetchedAt: NOW,
    })

    await open()
    expect(tmdbMovieCalls()).toHaveLength(1)

    const view = await open()
    expect(tmdbMovieCalls()).toHaveLength(1)
    expect(view.trailers?.map((c) => c.videoId)).toEqual(['provTrail01', 'trailerEn01'])
  })

  it('no_match não é repedido dentro dos 6 meses (não há vídeo a pedir)', async () => {
    await seed({
      provider: { synopsis: 'P' },
      providerFetchedAt: NOW,
      providerVersion: PROVIDER_FIELDS_VERSION,
      tmdb: { status: 'no_match' },
      tmdbFetchedAt: NOW,
    })

    await open()

    expect(tmdbMovieCalls()).toHaveLength(0)
  })

  it('provedor gravado com versão antiga é rebuscado dentro das 24 h, e depois não mais', async () => {
    await seed({
      provider: { synopsis: 'Antiga.' },
      providerFetchedAt: NOW,
      providerVersion: 1,
      tmdb: { status: 'no_match' },
      tmdbFetchedAt: NOW,
    })

    const view = await open()
    expect(panelCalls()).toHaveLength(1)
    expect(view.trailers?.map((c) => [c.videoId, c.origin])).toEqual([['provTrail01', 'provider']])

    await open()
    expect(panelCalls()).toHaveLength(1)
  })

  it('registro do provedor sem versão nenhuma (anterior à 033) também conta como vencido', async () => {
    await seed({ provider: { synopsis: 'Antiga.' }, providerFetchedAt: NOW, tmdb: { status: 'no_match' }, tmdbFetchedAt: NOW })

    await open()

    expect(panelCalls()).toHaveLength(1)
  })
})
