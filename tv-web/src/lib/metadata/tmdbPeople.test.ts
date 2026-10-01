import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { RATE_LIMIT_PAUSE_MS, saveTmdbKey } from './tmdbKeyRepository'
import { TMDB_CACHE_MS } from './titleMetadata'
import { loadPersonCredits } from './tmdbPeople'

const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-people-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function fakeFetch(handler: (url: URL) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/3/authentication') return json({ success: true })
    return handler(url)
  })
}

const personCalls = (fetchImpl: ReturnType<typeof vi.fn>) =>
  fetchImpl.mock.calls.filter((call) => new URL(String((call as unknown[])[0])).pathname.startsWith('/3/person/')).length

async function withKey(fetchImpl: ReturnType<typeof vi.fn>, now = () => NOW) {
  const options = { database, now, fetchImpl: fetchImpl as unknown as typeof fetch }
  await saveTmdbKey(KEY, options)
  return options
}

const BODY = {
  id: 1,
  name: 'Pessoa',
  combined_credits: {
    cast: [
      { id: 10, media_type: 'movie', title: 'Filme', release_date: '2001-01-01', popularity: 1 },
      { id: 11, media_type: 'tv', name: 'Jornal', first_air_date: '2002-01-01', genre_ids: [10763], popularity: 99 },
      { id: 12, media_type: 'tv', name: 'Reality', first_air_date: '2003-01-01', genre_ids: [10764], popularity: 98 },
      { id: 13, media_type: 'movie', title: 'Documentário', release_date: '2004-01-01', character: 'Himself', popularity: 97 },
      { id: 14, media_type: 'person', name: 'Outra pessoa' },
    ],
  },
}

describe('loadPersonCredits — casos além do contrato (feature 035)', () => {
  it('chave recusada e pausa ativa não fazem requisição; "offline" salvo não bloqueia a próxima tentativa', async () => {
    const fetchImpl = fakeFetch(() => json(BODY))
    const options = await withKey(fetchImpl)

    await database.integrations.update('tmdb', { state: 'refused' })
    expect(await loadPersonCredits(1, options)).toEqual({ status: 'error', reason: 'refused' })
    expect(personCalls(fetchImpl)).toBe(0)

    await database.integrations.update('tmdb', { state: 'rate_limited', pausedUntil: NOW + RATE_LIMIT_PAUSE_MS })
    expect(await loadPersonCredits(1, options)).toEqual({ status: 'error', reason: 'rate_limited' })
    expect(personCalls(fetchImpl)).toBe(0)

    await database.integrations.update('tmdb', { state: 'offline', pausedUntil: undefined })
    expect((await loadPersonCredits(1, options)).status).toBe('ok')
    expect(personCalls(fetchImpl)).toBe(1)
  })

  it('not_found não é gravado; 429 liga a pausa e nada é guardado', async () => {
    let status = 404
    const fetchImpl = fakeFetch(() => json({ status_code: 34 }, status))
    const options = await withKey(fetchImpl)

    expect(await loadPersonCredits(1, options)).toEqual({ status: 'error', reason: 'not_found' })
    expect(await database.tmdbPeople.count()).toBe(0)

    status = 429
    expect(await loadPersonCredits(1, options)).toEqual({ status: 'error', reason: 'rate_limited' })
    expect(await database.tmdbPeople.count()).toBe(0)
    expect((await database.integrations.get('tmdb'))?.pausedUntil).toBe(NOW + RATE_LIMIT_PAUSE_MS)
  })

  it('"Self"/News/Reality e tipos que não são filme/série ficam de fora', async () => {
    const options = await withKey(fakeFetch(() => json(BODY)))
    const result = await loadPersonCredits(1, options)
    expect(result.status === 'ok' && result.person.credits.map((credit) => credit.tmdbId)).toEqual([10])
  })

  it('chamadas simultâneas compartilham uma só requisição', async () => {
    const fetchImpl = fakeFetch(() => json(BODY))
    const options = await withKey(fetchImpl)
    await Promise.all([loadPersonCredits(1, options), loadPersonCredits(1, options), loadPersonCredits(1, options)])
    expect(personCalls(fetchImpl)).toBe(1)
  })

  it('cache vencido (6 meses) pede de novo; dentro da validade não', async () => {
    const fetchImpl = fakeFetch(() => json(BODY))
    let now = NOW
    const options = await withKey(fetchImpl, () => now)
    await loadPersonCredits(1, options)
    now = NOW + TMDB_CACHE_MS - 1000
    await loadPersonCredits(1, options)
    expect(personCalls(fetchImpl)).toBe(1)
    now = NOW + TMDB_CACHE_MS + 1000
    await loadPersonCredits(1, options)
    expect(personCalls(fetchImpl)).toBe(2)
  })
})
