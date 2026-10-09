import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { tmdbGet } from './tmdbConnector'
import { loadTipPool } from './tmdbDiscovery'
import { saveTmdbKey } from './tmdbKeyRepository'

const KEY = '0123456789abcdef0123456789abcdef'
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
})
const databases: CatalogDb[] = []
afterEach(async () => { for (const database of databases.splice(0)) await database.delete() })

describe('065 query fault probe', () => {
  it('timeout de corpo aborta o sinal e sanitiza o resultado', async () => {
    let release: (() => void) | undefined
    let signal: AbortSignal | null | undefined
    const result = tmdbGet('/movie/1', {}, { key: KEY, format: 'v3' }, async (_url, init) => {
      signal = init?.signal
      return new Promise<Response>(resolve => { release = () => resolve(json({ ok: true })) })
    }, { timeoutMs: 20 })
    await expect(result).rejects.toMatchObject({ kind: 'offline' })
    expect(signal?.aborted).toBe(true)
    release?.()
  })

  it('429 intermediário não publica parcial nem chama lotes seguintes', async () => {
    const database = new CatalogDb(`probe-${Math.random().toString(36).slice(2)}`)
    databases.push(database)
    await database.open()
    let clock = Date.UTC(2026, 9, 7, 12)
    const pages: number[] = []
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      const page = Number(url.searchParams.get('page') ?? 1)
      pages.push(page)
      if (page === 2) return json({}, 429, { 'Retry-After': '120' })
      return json({ results: [{ id: page, title: `Synthetic ${page}`, release_date: '2025-01-01', vote_average: 8, vote_count: 900, popularity: 1 }] })
    }
    const options = { database, now: () => clock, fetchImpl, language: 'pt' as const }
    await saveTmdbKey(KEY, options)
    clock += 24 * 60 * 60 * 1000
    const result = await loadTipPool('movie', options)
    expect(result).toMatchObject({ status: 'unavailable', titles: [], stale: false })
    expect(pages.some(page => page >= 6)).toBe(false)
    expect((await database.integrations.get('tmdb'))?.pausedUntil).toBeGreaterThanOrEqual(clock + 120_000)
  })
})
