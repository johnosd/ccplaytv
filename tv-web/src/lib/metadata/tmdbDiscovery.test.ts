import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { RATE_LIMIT_PAUSE_MS, removeTmdbKey, saveTmdbKey } from './tmdbKeyRepository'
import { loadTipPool, loadWeeklyTrending, TIP_PAGES, weekKey } from './tmdbDiscovery'

const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 30, 15, 0, 0)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-discovery-unit-${Math.random().toString(36).slice(2)}`)
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

async function withKey(fetchImpl: ReturnType<typeof vi.fn>, language: 'pt' | 'en' = 'pt') {
  const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch, language }
  await saveTmdbKey(KEY, options)
  fetchImpl.mockClear()
  return options
}

const page = (start: number, count = 20) => ({
  results: Array.from({ length: count }, (_, i) => ({
    id: start + i,
    title: `Filme ${start + i}`,
    release_date: '2024-01-01',
    vote_average: 8,
    vote_count: 900,
    popularity: 10,
  })),
})

describe('weekKey', () => {
  it('semana ISO local: segunda abre a semana, domingo fecha, virada de ano', () => {
    expect(weekKey(new Date(2026, 8, 28, 9).getTime())).toBe('2026-W40') // segunda
    expect(weekKey(new Date(2026, 9, 4, 23).getTime())).toBe('2026-W40') // domingo
    expect(weekKey(new Date(2026, 9, 5, 0, 30).getTime())).toBe('2026-W41') // segunda seguinte
    expect(weekKey(new Date(2026, 11, 31, 12).getTime())).toBe('2026-W53') // quinta: 2026 tem 53 semanas ISO
    expect(weekKey(new Date(2027, 0, 1, 12).getTime())).toBe('2026-W53') // sexta, ainda a mesma semana
    expect(weekKey(new Date(2025, 11, 29, 12).getTime())).toBe('2026-W01') // segunda, já semana 1 do ano seguinte
  })
})

describe('loadWeeklyTrending / loadTipPool — casos além do contrato (feature 057)', () => {
  it('item sem id ou sem título é descartado sem renumerar os demais', async () => {
    const fetchImpl = fakeFetch(() =>
      json({ results: [{ id: 1, title: 'A' }, { title: 'sem id' }, { id: 3, title: '  ' }, { id: 4, title: 'D' }] }),
    )
    const result = await loadWeeklyTrending('movie', await withKey(fetchImpl))
    expect(result.titles.map((title) => [title.tmdbId, title.rank])).toEqual([
      [1, 1],
      [4, 4],
    ])
  })

  it('pool: junta as páginas sem repetir, a 1ª falhando falha tudo, as demais falhando guardam as que vieram', async () => {
    let failFrom = 99
    const fetchImpl = fakeFetch((url) => {
      const n = Number(url.searchParams.get('page'))
      if (n >= failFrom) return json({}, 500)
      return json(page(1000 + (n - 1) * 20 - (n === 3 ? 5 : 0))) // a página 3 repete 5 títulos da 2
    })
    const options = await withKey(fetchImpl)

    const all = await loadTipPool('movie', options)
    expect(all.status).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(TIP_PAGES)
    expect(new Set(all.titles.map((title) => title.tmdbId)).size).toBe(all.titles.length)
    expect(all.titles.length).toBe(TIP_PAGES * 20 - 5)
    expect(all.titles.map((title) => title.rank)).toEqual(Array.from({ length: all.titles.length }, (_, i) => i + 1))
    const params = new URL(String(fetchImpl.mock.calls[0][0])).searchParams
    expect(params.get('vote_average.gte')).toBe('7')
    expect(params.get('vote_count.gte')).toBe('300')
    expect(params.get('primary_release_date.gte')).toBe('2011-01-01')

    await database.discoveryCache.clear()
    failFrom = 4
    const partial = await loadTipPool('movie', options)
    expect(partial.titles.length).toBe(3 * 20 - 5)

    await database.discoveryCache.clear()
    failFrom = 1
    expect(await loadTipPool('movie', options)).toEqual({ status: 'unavailable', titles: [], stale: false })
  })

  it('série pede `first_air_date.gte` e `vote_count.gte` próprio', async () => {
    const fetchImpl = fakeFetch(() => json({ results: [{ id: 5, name: 'S', first_air_date: '2023-02-02', vote_average: 8, vote_count: 150 }] }))
    await loadTipPool('series', await withKey(fetchImpl))
    const params = new URL(String(fetchImpl.mock.calls[0][0])).searchParams
    expect(params.get('first_air_date.gte')).toBe('2011-01-01')
    expect(params.get('vote_count.gte')).toBe('100')
    expect(params.has('primary_release_date.gte')).toBe(false)
  })

  it('chave recusada e pausa por limite de uso não fazem requisição e devolvem o cache guardado', async () => {
    const fetchImpl = fakeFetch(() => json(page(1)))
    const options = await withKey(fetchImpl)
    const first = await loadWeeklyTrending('movie', options)
    fetchImpl.mockClear()
    const nextWeek = { ...options, now: () => NOW + 8 * 24 * 60 * 60 * 1000 }

    await database.integrations.update('tmdb', { state: 'refused' })
    expect(await loadWeeklyTrending('movie', nextWeek)).toEqual({ status: 'ok', titles: first.titles, stale: true })
    await database.integrations.update('tmdb', { state: 'rate_limited', pausedUntil: NOW + 8 * 24 * 60 * 60 * 1000 + RATE_LIMIT_PAUSE_MS })
    expect(await loadWeeklyTrending('movie', nextWeek)).toEqual({ status: 'ok', titles: first.titles, stale: true })
    expect(fetchImpl).not.toHaveBeenCalled()

    // Sem nada guardado, a chave recusada deixa a fileira ausente.
    expect(await loadWeeklyTrending('series', nextWeek)).toEqual({ status: 'unavailable', titles: [], stale: false })
  })

  it('429 liga a pausa, marca o estado e nada novo é guardado; sucesso depois de "offline" volta a "connected"', async () => {
    let status = 429
    const fetchImpl = fakeFetch(() => (status === 200 ? json(page(1)) : json({}, status)))
    const options = await withKey(fetchImpl)

    expect(await loadWeeklyTrending('movie', options)).toEqual({ status: 'unavailable', titles: [], stale: false })
    expect(await database.discoveryCache.count()).toBe(0)
    expect((await database.integrations.get('tmdb'))?.state).toBe('rate_limited')
    expect((await database.integrations.get('tmdb'))?.pausedUntil).toBe(NOW + RATE_LIMIT_PAUSE_MS)

    await database.integrations.update('tmdb', { state: 'offline', pausedUntil: undefined })
    status = 200
    expect((await loadWeeklyTrending('movie', options)).status).toBe('ok')
    expect((await database.integrations.get('tmdb'))?.state).toBe('connected')
  })

  it('cada idioma tem a sua entrada de cache; chamadas simultâneas compartilham a mesma obtenção', async () => {
    const fetchImpl = fakeFetch(() => json(page(1)))
    const pt = await withKey(fetchImpl, 'pt')
    await Promise.all([loadWeeklyTrending('movie', pt), loadWeeklyTrending('movie', pt)])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await loadWeeklyTrending('movie', { ...pt, language: 'en' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1][0])).toContain('language=en-US')
    expect((await database.discoveryCache.toArray()).map((row) => row.id).sort()).toEqual(['trending:movie:en', 'trending:movie:pt'])
  })

  it('removeTmdbKey esvazia o cache da descoberta', async () => {
    const fetchImpl = fakeFetch(() => json(page(1)))
    const options = await withKey(fetchImpl)
    await loadWeeklyTrending('movie', options)
    expect(await database.discoveryCache.count()).toBe(1)
    await removeTmdbKey({ database })
    expect(await database.discoveryCache.count()).toBe(0)
    expect(await loadWeeklyTrending('movie', options)).toEqual({ status: 'no_key', titles: [], stale: false })
  })
})
