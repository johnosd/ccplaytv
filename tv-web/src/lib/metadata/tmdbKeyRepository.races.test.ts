import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { markTmdbState, readTmdbCredential, removeTmdbKey, saveTmdbKey, testTmdbKey } from './tmdbKeyRepository'

const KEY = '0123456789abcdef0123456789abcdef'
const OTHER = 'fedcba9876543210fedcba9876543210'
const NOW = Date.UTC(2026, 9, 8, 12)
const response = (status = 200, retryAfter?: string) => new Response(JSON.stringify({ success: true }), {
  status, headers: retryAfter ? { 'Retry-After': retryAfter } : {},
})
let database: CatalogDb
beforeEach(async () => {
  database = new CatalogDb(`tmdb-key-races-${Math.random().toString(36).slice(2)}`)
  await database.open()
})
afterEach(async () => { await database.delete() })
const options = (fetchImpl: typeof fetch = async () => response(), now = NOW) => ({ database, fetchImpl, now: () => now })
function delayed() {
  let release!: (value: Response) => void
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const pending = new Promise<Response>(resolve => { release = resolve })
  const fetchImpl: typeof fetch = async () => { started(); return pending }
  return { ready, release, fetchImpl }
}

describe('065 revisões e pausas da chave TMDB', () => {
  it('leituras simultâneas atribuem uma única revisão opaca ao legado', async () => {
    await database.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: 'connected', lastTestedAt: NOW })
    const credentials = await Promise.all(Array.from({ length: 8 }, () => readTmdbCredential({ database })))
    expect(credentials[0]?.revision).toEqual(expect.any(String))
    expect(new Set(credentials.map(credential => credential?.revision)).size).toBe(1)
    expect(credentials[0]?.revision).not.toContain(KEY)
  })

  it('remover durante o primeiro save impede ressuscitar uma chave ausente', async () => {
    const call = delayed()
    const saving = saveTmdbKey(KEY, options(call.fetchImpl))
    await call.ready
    await removeTmdbKey({ database })
    call.release(response())
    expect(await saving).toMatchObject({ ok: false })
    expect(await database.integrations.get('tmdb')).toBeUndefined()
  })

  it('save antigo não substitui uma chave salva depois', async () => {
    await saveTmdbKey(KEY, options())
    const call = delayed()
    const saving = saveTmdbKey(OTHER, options(call.fetchImpl))
    await call.ready
    await removeTmdbKey({ database })
    await saveTmdbKey(KEY, options())
    const revision = (await readTmdbCredential({ database }))?.revision
    call.release(response())
    await saving
    expect(await readTmdbCredential({ database })).toMatchObject({ key: KEY, revision })
  })

  it('test antigo não recria uma chave removida', async () => {
    await saveTmdbKey(KEY, options())
    const call = delayed()
    const testing = testTmdbKey(options(call.fetchImpl))
    await call.ready
    await removeTmdbKey({ database })
    call.release(response())
    expect(await testing).toEqual({ state: 'not_configured' })
    expect(await database.integrations.count()).toBe(0)
  })

  it('mark de revisão antiga não altera a chave substituída', async () => {
    await saveTmdbKey(KEY, options())
    const revision = (await readTmdbCredential({ database }))?.revision
    await saveTmdbKey(OTHER, options())
    await markTmdbState('rate_limited', { database, now: () => NOW, expectedCredentialRevision: revision }, 120_000)
    expect(await readTmdbCredential({ database })).toMatchObject({ key: OTHER, state: 'connected' })
    expect((await readTmdbCredential({ database }))?.pausedUntil).toBeUndefined()
  })

  it('test e save da mesma chave respeitam pausa sem HTTP ou nova revisão', async () => {
    await saveTmdbKey(KEY, options())
    await markTmdbState('rate_limited', options(), 120_000)
    const before = await readTmdbCredential({ database })
    const fetchImpl = vi.fn(async () => response())
    expect(await testTmdbKey(options(fetchImpl))).toMatchObject({ state: 'offline' })
    expect(await saveTmdbKey(KEY, options(fetchImpl))).toMatchObject({ ok: true, status: { state: 'offline' } })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await readTmdbCredential({ database })).toMatchObject({ revision: before?.revision, pausedUntil: before?.pausedUntil })
  })

  it.each([200, 500])('resposta concorrente %i não reduz a pausa de um 429', async status => {
    await saveTmdbKey(KEY, options())
    const first = delayed()
    const second = delayed()
    const one = testTmdbKey(options(first.fetchImpl))
    const two = testTmdbKey(options(second.fetchImpl))
    await Promise.all([first.ready, second.ready])
    first.release(response(429, '120'))
    await one
    second.release(response(status))
    await two
    expect(await readTmdbCredential({ database })).toMatchObject({ state: 'rate_limited', pausedUntil: NOW + 120_000 })
  })

  it('marks concorrentes usam a maior pausa, inclusive um Retry-After posterior', async () => {
    await saveTmdbKey(KEY, options())
    const revision = (await readTmdbCredential({ database }))?.revision
    const scoped = { ...options(), expectedCredentialRevision: revision }
    await markTmdbState('rate_limited', scoped, 120_000)
    await Promise.all([markTmdbState('connected', scoped), markTmdbState('rate_limited', scoped, 300_000)])
    expect(await readTmdbCredential({ database })).toMatchObject({ state: 'rate_limited', pausedUntil: NOW + 300_000 })
  })

  it('pausa expirada permite autenticar novamente', async () => {
    await saveTmdbKey(KEY, options())
    await markTmdbState('rate_limited', options(), 120_000)
    const fetchImpl = vi.fn(async () => response())
    expect(await testTmdbKey(options(fetchImpl, NOW + 120_001))).toMatchObject({ state: 'connected' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await readTmdbCredential({ database }))?.pausedUntil).toBeUndefined()
  })
})
