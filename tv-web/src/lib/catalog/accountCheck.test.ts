import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { checkSourceAccount } from './accountCheck'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-account-check-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await database.delete()
})

const SOURCE: SourceRecord = {
  id: 'fonte-xtream',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  providerImportMode: 'xtream_api',
  connectionState: 'synced',
  accountStatus: 'active',
  accountExpiresAt: 1_000_000,
  accountCheckedAt: 1000,
  createdAt: 1,
  updatedAt: 1,
}

const panel = (userInfo: Record<string, unknown>) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({ user_info: { auth: 1, ...userInfo } })))

describe('checkSourceAccount (feature 034)', () => {
  it('painel respondeu: grava status, vencimento e instante; devolve fresh com a mesma conta', async () => {
    await database.sources.add(SOURCE)
    vi.stubGlobal('fetch', panel({ exp_date: '1800000000' }))
    const result = await checkSourceAccount(SOURCE.id, { database, now: () => 9000 })
    expect(result).toEqual({ fresh: true, account: { status: 'active', expiresAt: 1_800_000_000_000, checkedAt: 9000 } })
    const saved = await database.sources.get(SOURCE.id)
    expect([saved?.accountStatus, saved?.accountExpiresAt, saved?.accountCheckedAt]).toEqual(['active', 1_800_000_000_000, 9000])
  })

  it('exp_date no passado → "expired"; exp_date 0 → sem data (null) e ativa', async () => {
    await database.sources.add(SOURCE)
    vi.stubGlobal('fetch', panel({ exp_date: '1000' }))
    expect((await checkSourceAccount(SOURCE.id, { database, now: () => Date.UTC(2026, 8, 30) })).account.status).toBe('expired')
    vi.stubGlobal('fetch', panel({ exp_date: '0' }))
    expect(await checkSourceAccount(SOURCE.id, { database, now: () => 9500 })).toEqual({
      fresh: true,
      account: { status: 'active', expiresAt: null, checkedAt: 9500 },
    })
  })

  it('auth 0 grava "refused"', async () => {
    await database.sources.add(SOURCE)
    vi.stubGlobal('fetch', panel({ auth: 0 }))
    const result = await checkSourceAccount(SOURCE.id, { database, now: () => 9100 })
    expect(result.fresh && result.account.status).toBe('refused')
  })

  it('401 grava "refused" com o instante, preserva o vencimento guardado e continua fresh', async () => {
    await database.sources.add(SOURCE)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    const result = await checkSourceAccount(SOURCE.id, { database, now: () => 9200 })
    expect(result).toEqual({ fresh: true, account: { status: 'refused', expiresAt: 1_000_000, checkedAt: 9200 } })
    const saved = await database.sources.get(SOURCE.id)
    expect([saved?.accountStatus, saved?.accountExpiresAt, saved?.accountCheckedAt]).toEqual(['refused', 1_000_000, 9200])
    expect(saved?.connectionState).toBe('synced')
  })

  it('painel incompatível (sem user_info) ou HTTP 500: "network", nada gravado', async () => {
    await database.sources.add(SOURCE)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    const result = await checkSourceAccount(SOURCE.id, { database, now: () => 9300 })
    expect(result).toMatchObject({ fresh: false, reason: 'network' })
    expect((await database.sources.get(SOURCE.id))?.accountCheckedAt).toBe(1000)
  })

  it('fonte sem credencial (M3U avulsa): "no_credential", sem chamar o painel', async () => {
    await database.sources.add({ id: 'avulsa', type: 'm3u_url', displayName: 'Lista', m3uUrl: 'http://exemplo.test/lista.m3u', connectionState: 'synced', createdAt: 1, updatedAt: 1 })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await checkSourceAccount('avulsa', { database })).toEqual({ fresh: false, reason: 'no_credential', account: {} })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('o erro cru nunca vai para o console, e o resultado não tem segredo (rede e recusa)', async () => {
    await database.sources.add(SOURCE)
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch http://painel.exemplo.test/player_api.php?username=usuario-teste&password=senha-teste')))
    const offline = await checkSourceAccount(SOURCE.id, { database, timeoutMs: 50 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    const refused = await checkSourceAccount(SOURCE.id, { database })
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/senha-teste|usuario-teste|painel\.exemplo/)
    expect(JSON.stringify([offline, refused])).not.toMatch(/senha-teste|usuario-teste|painel\.exemplo/)
  })

  it('o temporizador é limpo no fim: nada fica pendente depois de a consulta responder', async () => {
    await database.sources.add(SOURCE)
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', panel({ exp_date: '1800000000' }))
      const promise = checkSourceAccount(SOURCE.id, { database, timeoutMs: 5000 })
      await vi.advanceTimersByTimeAsync(10)
      await promise
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
