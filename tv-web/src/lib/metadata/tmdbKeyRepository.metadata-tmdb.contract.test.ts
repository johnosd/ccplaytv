/**
 * Contrato da feature 032 (chave TMDB BYOK) — travado em
 * `sdd/specs/032-metadata-tmdb-integracoes/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/chave-tmdb.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { getTmdbStatus, removeTmdbKey, saveTmdbKey } from './tmdbKeyRepository'

const REFUSED_KEY = 'ffffffffffffffffffffffffffffffff'
const GOOD_KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-tmdb-key-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('chave TMDB — contrato da feature 032', () => {
  // US2/AC2-AC3, FR-011/FR-012 (testa antes de salvar; recusada não é salva), FR-013/SC-005 (nunca inteira fora do módulo), FR-014 (remover)
  it('chave recusada não é salva; chave aceita vira "connected" mascarada, sem aparecer inteira em estado nem em log; remover volta a "not_configured"', async () => {
    const logged: string[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack ?? ''}` : String(arg))).join(' '))
      })
    }

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const serialized = `${url.href} ${JSON.stringify(init?.headers ?? {})}`
      if (url.hostname !== 'api.themoviedb.org') return json({}, 500)
      return serialized.includes(GOOD_KEY)
        ? json({ success: true })
        : json({ success: false, status_code: 7, status_message: 'Invalid API key' }, 401)
    })
    const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch }

    const refused = await saveTmdbKey(REFUSED_KEY, options)
    expect(refused).toEqual({ ok: false, reason: 'refused' })
    expect((await getTmdbStatus(options)).state).toBe('not_configured')

    const accepted = await saveTmdbKey(GOOD_KEY, options)
    expect(accepted.ok).toBe(true)
    const status = await getTmdbStatus(options)
    expect(status).toMatchObject({ state: 'connected', format: 'v3', lastTestedAt: NOW })
    expect(status.maskedKey).toMatch(/cdef$/)
    expect(JSON.stringify(status)).not.toContain(GOOD_KEY)
    expect(JSON.stringify(accepted)).not.toContain(GOOD_KEY)
    expect(logged.join('\n')).not.toContain(GOOD_KEY)
    expect(logged.join('\n')).not.toContain(REFUSED_KEY)

    await removeTmdbKey(options)
    expect(await getTmdbStatus(options)).toEqual({ state: 'not_configured' })
  })
})
