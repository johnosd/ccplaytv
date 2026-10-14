/**
 * Teste de CONTRATO da feature 057 (Top 10 da semana e Dica, TMDB) — a camada de dados: sem chave não há requisição, o ranking
 * semanal fica em cache por semana, e sem rede o último resultado guardado vale (ou nada, sem erro e sem a chave em lugar
 * nenhum). Travado em `sdd/specs/057-top10-dica-tmdb/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { saveTmdbKey } from './tmdbKeyRepository'
import { loadWeeklyTrending, TRENDING_LIMIT } from './tmdbDiscovery'

const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 30, 15, 0, 0) // quarta-feira, semana ISO 40
const DAY = 24 * 60 * 60 * 1000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const movies = Array.from({ length: 20 }, (_, i) => ({
  id: 1000 + i,
  title: `Filme ${i + 1}`,
  original_title: `Film ${i + 1}`,
  release_date: '2025-05-05',
  vote_average: 7.1,
  vote_count: 900,
  popularity: 50,
  poster_path: `/p${i}.jpg`,
}))
const shows = Array.from({ length: 20 }, (_, i) => ({
  id: 2000 + i,
  name: `Série ${i + 1}`,
  original_name: `Show ${i + 1}`,
  first_air_date: '2024-03-03',
  vote_average: 8.2,
  vote_count: 400,
  popularity: 70,
}))

let database: CatalogDb
let offline = false
let clock = NOW

const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.pathname === '/3/authentication') return json({ success: true })
  if (offline) throw new TypeError(`Failed to fetch ${url.toString()}`) // a URL v3 carrega a chave
  if (url.pathname === '/3/trending/movie/week') return json({ results: movies })
  if (url.pathname === '/3/trending/tv/week') return json({ results: shows })
  return json({}, 404)
})
const trendingCalls = (path: string) => fetchImpl.mock.calls.filter((call) => new URL(String((call as unknown[])[0])).pathname === path).length

const options = () => ({ database, now: () => clock, fetchImpl: fetchImpl as unknown as typeof fetch, language: 'pt' as const })

beforeEach(async () => {
  database = new CatalogDb(`test-discovery-${Math.random().toString(36).slice(2)}`)
  await database.open()
  offline = false
  clock = NOW
  fetchImpl.mockClear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('loadWeeklyTrending — contrato da feature 057', () => {
  // US1/AC1, US4/AC1..AC3, FR-002, FR-003, FR-015, FR-016, FR-017, Constitution: "Segredos Fora dos Clientes e dos Logs"
  it('sem chave não faz requisição; com chave guarda o ranking da semana (10 posições reais); sem rede usa o último guardado; sem nada não lança, não loga e não carrega a chave', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))

    // Sem chave: nada é consultado.
    expect(await loadWeeklyTrending('movie', options())).toEqual({ status: 'no_key', titles: [], stale: false })
    expect(fetchImpl).not.toHaveBeenCalled()

    // Com chave: só as 10 primeiras posições do TMDB, com a posição real, o ano e os dados que a Dica também usa.
    expect((await saveTmdbKey(KEY, options())).ok).toBe(true)
    fetchImpl.mockClear()
    const first = await loadWeeklyTrending('movie', options())
    expect(first.status).toBe('ok')
    expect(first.stale).toBe(false)
    expect(first.titles).toHaveLength(TRENDING_LIMIT)
    expect(first.titles.map((title) => title.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(first.titles[0]).toMatchObject({
      tmdbId: 1000,
      kind: 'movie',
      title: 'Filme 1',
      originalTitle: 'Film 1',
      year: 2025,
      voteAverage: 7.1,
      voteCount: 900,
      popularity: 50,
      rank: 1,
    })
    expect(trendingCalls('/3/trending/movie/week')).toBe(1)

    // Mesma semana: vem do aparelho, sem nova requisição.
    clock = NOW + 3 * 60 * 60 * 1000
    expect(await loadWeeklyTrending('movie', options())).toEqual(first)
    expect(trendingCalls('/3/trending/movie/week')).toBe(1)

    // Séries: outro endpoint, `name`/`first_air_date` e tipo `series`.
    const series = await loadWeeklyTrending('series', options())
    expect(series.titles[0]).toMatchObject({ tmdbId: 2000, kind: 'series', title: 'Série 1', year: 2024, rank: 1 })
    expect(trendingCalls('/3/trending/tv/week')).toBe(1)

    // Semana seguinte e sem rede: o último resultado guardado vale (marcado como vencido) e nada lança.
    clock = NOW + 8 * DAY
    offline = true
    const stale = await loadWeeklyTrending('movie', options())
    expect(stale).toEqual({ status: 'ok', titles: first.titles, stale: true })
    expect(JSON.stringify(stale)).not.toContain(KEY)

    // Outro aparelho sem nenhum guardado e sem rede: some sem erro.
    const empty = new CatalogDb(`test-discovery-empty-${Math.random().toString(36).slice(2)}`)
    await empty.open()
    offline = false
    await saveTmdbKey(KEY, { database: empty, now: () => clock, fetchImpl: fetchImpl as unknown as typeof fetch })
    offline = true
    const none = await loadWeeklyTrending('movie', { ...options(), database: empty })
    expect(none).toEqual({ status: 'unavailable', titles: [], stale: false })
    expect(JSON.stringify(none)).not.toContain(KEY)
    await empty.delete()

    for (const spy of logs) expect(spy).not.toHaveBeenCalled()
  })
})
