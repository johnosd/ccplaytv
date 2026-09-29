import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { getTmdbStatus, markTmdbState, readTmdbCredential, removeTmdbKey, saveTmdbKey, testTmdbKey, RATE_LIMIT_PAUSE_MS } from './tmdbKeyRepository'

const V3 = '0123456789abcdef0123456789abcdef'
const V3_OTHER = 'fedcba9876543210fedcba9876543210'
const V4 = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.assinatura_teste-1'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-tmdb-repo-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function options(fetchImpl: ReturnType<typeof vi.fn>, now = NOW) {
  return { database, now: () => now, fetchImpl: fetchImpl as unknown as typeof fetch }
}

describe('saveTmdbKey (feature 032, FR-011/FR-012)', () => {
  it('formato inválido: recusa sem fazer nenhuma requisição', async () => {
    const fetchImpl = vi.fn()
    for (const bad of ['', 'curta', `${V3}zz`, 'eyJ.so.dois']) {
      expect(await saveTmdbKey(bad, options(fetchImpl))).toEqual({ ok: false, reason: 'invalid_format' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect((await getTmdbStatus({ database })).state).toBe('not_configured')
  })

  it('token v4 vai no cabeçalho Bearer e é guardado como v4, mascarado pelos 4 últimos', async () => {
    const fetchImpl = vi.fn(async () => response(200, { success: true }))
    const result = await saveTmdbKey(`  ${V4}  `, options(fetchImpl))

    expect(result.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).searchParams.has('api_key')).toBe(false)
    expect(init.headers).toEqual({ Authorization: `Bearer ${V4}` })
    expect(await getTmdbStatus({ database })).toMatchObject({ state: 'connected', format: 'v4', maskedKey: `••••${V4.slice(-4)}` })
  })

  it.each([
    [429, 'rate_limited'],
    [500, 'offline'],
    [401, 'refused'],
  ])('status %i não grava e devolve %s; a chave anterior continua como estava', async (status, reason) => {
    await saveTmdbKey(V3, options(vi.fn(async () => response(200, { success: true }))))

    const result = await saveTmdbKey(V3_OTHER, options(vi.fn(async () => response(status))))

    expect(result).toEqual({ ok: false, reason })
    expect((await readTmdbCredential({ database }))?.key).toBe(V3)
  })

  it('falha de rede vira "offline" e não grava', async () => {
    const result = await saveTmdbKey(V3, options(vi.fn(async () => { throw new TypeError('Failed to fetch') })))
    expect(result).toEqual({ ok: false, reason: 'offline' })
    expect((await getTmdbStatus({ database })).state).toBe('not_configured')
  })

  it('salvar outra chave aceita substitui a anterior', async () => {
    await saveTmdbKey(V3, options(vi.fn(async () => response(200, { success: true }))))
    await saveTmdbKey(V3_OTHER, options(vi.fn(async () => response(200, { success: true }))))
    expect((await readTmdbCredential({ database }))?.key).toBe(V3_OTHER)
    expect((await getTmdbStatus({ database })).maskedKey).toBe(`••••${V3_OTHER.slice(-4)}`)
  })
})

describe('testTmdbKey / markTmdbState (feature 032, FR-024)', () => {
  beforeEach(async () => {
    await saveTmdbKey(V3, options(vi.fn(async () => response(200, { success: true }))))
  })

  it('sem chave: "not_configured" e nenhuma requisição', async () => {
    await database.integrations.clear()
    const fetchImpl = vi.fn()
    expect(await testTmdbKey(options(fetchImpl))).toEqual({ state: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('401 vira "refused" sem apagar a chave; 200 depois volta a "connected"', async () => {
    const refused = await testTmdbKey(options(vi.fn(async () => response(401)), NOW + 1))
    expect(refused).toMatchObject({ state: 'refused', lastTestedAt: NOW + 1 })
    expect((await readTmdbCredential({ database }))?.key).toBe(V3)

    const ok = await testTmdbKey(options(vi.fn(async () => response(200, { success: true })), NOW + 2))
    expect(ok).toMatchObject({ state: 'connected', lastTestedAt: NOW + 2 })
  })

  it('429 liga a pausa de 10 min; rede vira "offline" sem pausa', async () => {
    await testTmdbKey(options(vi.fn(async () => response(429))))
    expect(await readTmdbCredential({ database })).toMatchObject({ state: 'rate_limited', pausedUntil: NOW + RATE_LIMIT_PAUSE_MS })

    await testTmdbKey(options(vi.fn(async () => { throw new TypeError('x') })))
    const credential = await readTmdbCredential({ database })
    expect(credential?.state).toBe('offline')
    expect(credential?.pausedUntil).toBeUndefined()
  })

  it('markTmdbState grava o estado do enriquecimento (e a pausa no 429); sem chave, não faz nada', async () => {
    await markTmdbState('rate_limited', { database, now: () => NOW })
    expect(await readTmdbCredential({ database })).toMatchObject({ state: 'rate_limited', pausedUntil: NOW + RATE_LIMIT_PAUSE_MS })
    await markTmdbState('connected', { database, now: () => NOW })
    expect((await readTmdbCredential({ database }))?.pausedUntil).toBeUndefined()

    await database.integrations.clear()
    await markTmdbState('refused', { database })
    expect(await database.integrations.count()).toBe(0)
  })
})

describe('removeTmdbKey (feature 032, FR-014)', () => {
  it('apaga a chave e SÓ a parte TMDB do cache; a metadata do provedor fica', async () => {
    await saveTmdbKey(V3, options(vi.fn(async () => response(200, { success: true }))))
    await database.titleMetadata.bulkAdd([
      { stableId: 'a|movie|id:1', sourceId: 'a', kind: 'movie', provider: { synopsis: 'P' }, providerFetchedAt: 1, tmdb: { status: 'matched', tmdbId: 9, fields: { synopsis: 'T' } }, tmdbFetchedAt: 2 },
      { stableId: 'a|movie|id:2', sourceId: 'a', kind: 'movie', tmdb: { status: 'no_match' }, tmdbFetchedAt: 3 },
    ])

    await removeTmdbKey({ database })

    expect(await getTmdbStatus({ database })).toEqual({ state: 'not_configured' })
    const rows = await database.titleMetadata.toArray()
    expect(rows.find((r) => r.stableId === 'a|movie|id:1')).toMatchObject({ provider: { synopsis: 'P' }, providerFetchedAt: 1 })
    for (const row of rows) {
      expect(row.tmdb).toBeUndefined()
      expect(row.tmdbFetchedAt).toBeUndefined()
    }
  })

  it('remover sem chave não falha', async () => {
    await expect(removeTmdbKey({ database })).resolves.toBeUndefined()
  })
})
