import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'

/**
 * Feature 042 (D-009, FR-005): com o app oculto nenhuma busca BYOK/TMDB
 * começa — e nada é gravado (nem "sem correspondência"). Ao voltar, o próximo
 * abrir do detalhe pede normalmente.
 */

const SOURCE_ID = 'fonte-1'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0)

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

function fakeFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'painel.test') return json({ info: {}, movie_data: {} })
    if (url.pathname === '/3/authentication') return json({ success: true })
    if (url.pathname === '/3/search/movie') return json({ results: [] })
    return json({ status_code: 34 }, 404)
  })
}

const tmdbCalls = (fetchImpl: ReturnType<typeof vi.fn>) =>
  fetchImpl.mock.calls.map((call) => new URL(String((call as unknown[])[0]))).filter((url) => url.hostname === 'api.themoviedb.org')

let database: CatalogDb

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

beforeEach(async () => {
  database = new CatalogDb(`test-title-oculto-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
})

afterEach(async () => {
  setVisibility('visible')
  vi.restoreAllMocks()
  await database.delete()
})

async function addMovie(): Promise<number> {
  return (await database.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name: 'Matrix',
    originalName: 'Matrix',
    groupOrder: 0,
    providerStreamId: '100',
    year: 1999,
  })) as number
}

describe('ensureTitleMetadata com o app oculto (feature 042)', () => {
  it('oculto: nenhuma chamada ao TMDB e nada de "sem correspondência" gravado; visível: pede normalmente', async () => {
    const movieId = await addMovie()
    const fetchImpl = fakeFetch()
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    const before = tmdbCalls(fetchImpl).length

    setVisibility('hidden')
    await ensureTitleMetadata(movieId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(tmdbCalls(fetchImpl).length).toBe(before)
    const stored = await database.titleMetadata.toArray()
    expect(stored.every((row) => row.tmdb === undefined)).toBe(true)

    setVisibility('visible')
    await ensureTitleMetadata(movieId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(tmdbCalls(fetchImpl).length).toBeGreaterThan(before)
  })
})
