import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { checkSourceAccount } from './accountCheck'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-account-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await database.delete()
})

const STORED_EXPIRES_AT = Date.UTC(2026, 8, 20)

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
  accountExpiresAt: STORED_EXPIRES_AT,
  accountCheckedAt: 1000,
  createdAt: 1,
  updatedAt: 1,
}

describe('Consulta leve à conta — contrato da feature 034', () => {
  // FR-009, SC-003, edge case "consulta demora"; Constitution: segredo fora do resultado
  it('sem resposta do painel (rede ou demora) devolve o dado guardado, não grava nada e não passa do limite', async () => {
    await database.sources.add(SOURCE)

    // Um painel que nunca responde — e ignora o sinal de cancelamento.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const startedAt = Date.now()
    const timedOut = await checkSourceAccount(SOURCE.id, { database, timeoutMs: 50, now: () => 5000 })
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(timedOut).toEqual({
      fresh: false,
      reason: 'timeout',
      account: { status: 'active', expiresAt: STORED_EXPIRES_AT, checkedAt: 1000 },
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const offline = await checkSourceAccount(SOURCE.id, { database, timeoutMs: 50, now: () => 6000 })
    expect(offline.fresh).toBe(false)
    expect(offline.fresh === false && offline.reason).toBe('network')

    const after = await database.sources.get(SOURCE.id)
    expect(after?.accountStatus).toBe('active')
    expect(after?.accountExpiresAt).toBe(STORED_EXPIRES_AT)
    expect(after?.accountCheckedAt).toBe(1000)

    const serialized = JSON.stringify([timedOut, offline])
    expect(serialized).not.toContain('senha-teste')
    expect(serialized).not.toContain('usuario-teste')
    expect(serialized).not.toContain('painel.exemplo.test')
  })
})
