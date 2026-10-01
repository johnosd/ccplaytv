/**
 * Contrato da feature 035 (filmografia da página de ator) — travado em
 * `sdd/specs/035-semelhantes-elenco-ator/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/pagina-de-ator.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { removeTmdbKey, saveTmdbKey } from './tmdbKeyRepository'
import { loadPersonCredits } from './tmdbPeople'

const TMDB_KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const KEANU = {
  id: 6384,
  name: 'Keanu Reeves',
  profile_path: '/keanu.jpg',
  biography: 'Nunca exibida.',
  combined_credits: {
    cast: [
      { id: 603, media_type: 'movie', title: 'Matrix', release_date: '1999-03-31', poster_path: '/m.jpg', overview: 'Neo.', popularity: 50, character: 'Neo' },
      // Talk show: aparição como ele mesmo, não atuação — fica de fora.
      { id: 1234, media_type: 'tv', name: 'The Tonight Show', first_air_date: '1954-09-27', genre_ids: [10767], popularity: 90, character: 'Self' },
      // Mesmo filme, outro papel: aparece uma vez só.
      { id: 603, media_type: 'movie', title: 'Matrix', release_date: '1999-03-31', popularity: 50, character: 'Thomas Anderson' },
      { id: 245891, media_type: 'movie', title: 'John Wick', release_date: '2014-10-22', popularity: 80 },
      { id: 777, media_type: 'tv', name: 'Swedish Dicks', original_name: 'Swedish Dicks', first_air_date: '2016-08-01', genre_ids: [35], popularity: 5 },
    ],
  },
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-035-people-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('loadPersonCredits — contrato da feature 035', () => {
  // US4/AC1+AC5, FR-016/FR-017/FR-018/FR-021/FR-022; Constitution: "Segredos Fora dos Clientes e dos Logs"
  it('falha não é guardada nem carrega a chave; sucesso é uma requisição, filtrada e ordenada, e fica em cache; remover a chave corta tudo sem requisição e descarta o cache', async () => {
    let personCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/person/6384') {
        personCalls += 1
        if (personCalls === 1) throw new TypeError(`Failed to fetch ${url.href}`)
        return json(KEANU)
      }
      return json({ status_code: 34 }, 404)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }
    expect((await saveTmdbKey(TMDB_KEY, options)).ok).toBe(true)

    const failed = await loadPersonCredits(6384, options)
    expect(failed).toEqual({ status: 'error', reason: 'offline' })
    expect(JSON.stringify(failed)).not.toContain(TMDB_KEY)

    const loaded = await loadPersonCredits(6384, options)
    expect(personCalls).toBe(2)
    const personCall = fetchImpl.mock.calls
      .map((call) => new URL(String(call[0])))
      .filter((url) => url.pathname === '/3/person/6384')
      .at(-1)
    expect(personCall?.searchParams.get('append_to_response')?.split(',')).toContain('combined_credits')

    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.person.name).toBe('Keanu Reeves')
    expect(loaded.person.photoUrl).toContain('/keanu.jpg')
    expect(JSON.stringify(loaded)).not.toContain('Nunca exibida.')
    expect(loaded.person.credits.map((credit) => [credit.tmdbId, credit.kind, credit.title, credit.year])).toEqual([
      [245891, 'movie', 'John Wick', 2014],
      [603, 'movie', 'Matrix', 1999],
      [777, 'series', 'Swedish Dicks', 2016],
    ])

    expect(await loadPersonCredits(6384, options)).toEqual(loaded)
    expect(personCalls).toBe(2)

    await removeTmdbKey(options)
    const callsWithoutKey = fetchImpl.mock.calls.length
    expect(await loadPersonCredits(6384, options)).toEqual({ status: 'error', reason: 'no_key' })
    expect(fetchImpl.mock.calls.length).toBe(callsWithoutKey)

    expect((await saveTmdbKey(TMDB_KEY, options)).ok).toBe(true)
    expect((await loadPersonCredits(6384, options)).status).toBe('ok')
    expect(personCalls).toBe(3)
  })
})
