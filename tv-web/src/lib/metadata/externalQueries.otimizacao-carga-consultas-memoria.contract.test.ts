import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { TmdbError, tmdbGet } from './tmdbConnector'
import { loadTipPool, loadWeeklyTrending } from './tmdbDiscovery'
import { markTmdbState, saveTmdbKey } from './tmdbKeyRepository'

const KEY = '0123456789abcdef0123456789abcdef' // Sintética; nunca credencial real.
const databases: CatalogDb[] = []
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const database of databases.splice(0)) await database.delete()
})

describe('065 — consultas externas', () => {
  it('FR-008/FR-014 US1-AC3: prazo inclui rede e corpo, erro é sanitizado e próxima consulta funciona', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    for (const phase of ['network', 'body'] as const) {
      let release: (() => void) | undefined
      let requestSignal: AbortSignal | null | undefined
      let outcome: unknown
      const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestSignal = init?.signal
        if (phase === 'network') {
          return new Promise<Response>((resolve) => { release = () => resolve(json({ ok: true })) })
        }
        return { ok: true, status: 200, json: () => new Promise((resolve) => {
          release = () => resolve({ ok: true })
        }) } as Response
      })
      const running = tmdbGet('/movie/1', {}, { key: KEY, format: 'v3' }, fetchImpl)
        .then((value) => { outcome = value }, (error: unknown) => { outcome = error })
      try {
        await vi.advanceTimersByTimeAsync(10_000)
        expect(outcome).toBeInstanceOf(TmdbError)
        expect(outcome).toMatchObject({ kind: 'offline' })
        expect(String(outcome)).not.toContain(KEY)
        expect(requestSignal?.aborted).toBe(true)
        await expect(tmdbGet('/movie/1', {}, { key: KEY, format: 'v3' }, async () => json({ ok: true })))
          .resolves.toEqual({ ok: true })
      } finally {
        release?.()
        await running
      }
    }
  })

  it('FR-009–FR-013 US1-AC1/2: 429 parcial preserva cache, pausa novos lotes e sucesso concorrente não remove pausa', async () => {
    const database = new CatalogDb(`test-065-external-${Math.random().toString(36).slice(2)}`)
    databases.push(database)
    await database.open()
    let clock = new Date(2026, 9, 7, 12).getTime()
    let limited = false
    const pages: number[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      const page = Number(url.searchParams.get('page') ?? 1)
      pages.push(page)
      if (limited && page === 2) return json({}, 429, { 'Retry-After': '120' })
      return json({ results: [{ id: page, title: `Filme ${page}`, release_date: '2025-01-01',
        vote_average: 8, vote_count: 900, popularity: 10 }] })
    })
    const options = { database, now: () => clock, fetchImpl, language: 'pt' as const }
    expect((await saveTmdbKey(KEY, options)).ok).toBe(true)
    const original = await loadTipPool('movie', options)
    const saved = await database.discoveryCache.get('pool:movie:pt')
    expect(original.titles).toHaveLength(8)
    clock += 24 * 60 * 60 * 1000
    limited = true
    pages.length = 0
    const failed = await loadTipPool('movie', options)
    expect(failed).toEqual({ ...original, stale: true })
    expect(await database.discoveryCache.get('pool:movie:pt')).toEqual(saved)
    expect(pages.some((page) => page >= 6)).toBe(false)
    const paused = (await database.integrations.get('tmdb'))?.pausedUntil
    expect(paused).toBeGreaterThanOrEqual(clock + 120_000)
    await markTmdbState('connected', options)
    expect((await database.integrations.get('tmdb'))?.pausedUntil).toBe(paused)
    const calls = fetchImpl.mock.calls.length
    await loadWeeklyTrending('series', options)
    expect(fetchImpl.mock.calls).toHaveLength(calls)
    expect(JSON.stringify(failed)).not.toContain(KEY)
  })
})
