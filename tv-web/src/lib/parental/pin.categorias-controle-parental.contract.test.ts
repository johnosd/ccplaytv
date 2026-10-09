import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { changePin, enableParentalControl, hasPin, recoverPinWithSource, verifyPin } from './pin'

/**
 * Feature 066 — contrato do PIN: segredo nunca guardado em texto (FR-012),
 * PIN errado só nega (FR-016) e recuperação pelos dados de uma lista,
 * conferida só no aparelho (FR-027..FR-030).
 */

let database: CatalogDb

beforeEach(() => {
  database = new CatalogDb(`TestDB_066_pin_${Math.random()}`)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
  database.close()
})

async function everythingStored(): Promise<string> {
  const dumps = await Promise.all(database.tables.map(async (table) => JSON.stringify(await table.toArray())))
  return dumps.join('\n')
}

describe('066 — PIN parental (contrato)', () => {
  it('FR-012/FR-016/FR-028/FR-029: PIN só como hash, errado nega, e a recuperação confere usuário+senha ou endereço sem tocar a rede', async () => {
    await database.sources.bulkPut([
      { id: 'x', type: 'provider_credentials', displayName: 'Painel', providerDns: 'http://painel.test', providerUsername: 'joao', providerPassword: 's3nh4-forte', connectionState: 'synced', createdAt: 0, updatedAt: 0 },
      { id: 'm', type: 'm3u_url', displayName: 'Arquivo', m3uUrl: 'http://lista.test/minha.m3u', connectionState: 'synced', createdAt: 0, updatedAt: 0 },
    ])
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(await hasPin(database)).toBe(false)
    await enableParentalControl('8642', [], database)
    expect(await hasPin(database)).toBe(true)
    expect(await everythingStored()).not.toContain('8642')
    expect(await verifyPin('8642', database)).toBe(true)
    expect(await verifyPin('1111', database)).toBe(false)

    expect(await recoverPinWithSource({ username: 'joao', password: 'errada' }, database)).toBe(false)
    expect(await recoverPinWithSource({ username: 'outro', password: 's3nh4-forte' }, database)).toBe(false)
    expect(await recoverPinWithSource({ url: 'http://lista.test/outra.m3u' }, database)).toBe(false)
    expect(await recoverPinWithSource({ username: 'joao', password: 's3nh4-forte' }, database)).toBe(true)
    expect(await recoverPinWithSource({ url: 'http://lista.test/minha.m3u' }, database)).toBe(true)

    await changePin('9753', database)
    expect(await verifyPin('9753', database)).toBe(true)
    expect(await verifyPin('8642', database)).toBe(false)
    expect(await everythingStored()).not.toContain('9753')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
