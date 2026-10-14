import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { listVisibleCategories } from '../catalog/categoryAccess'
import { hasPin, verifyPin } from './listPin'
import { sha256Hex } from './sha256'

/**
 * Feature 067 (T011, FR-024, D-002): o upgrade real da Dexie v20 → v21 → v22 migra o PIN único antes de qualquer leitura.
 * O contrato chama `migrateLegacyPin` direto; aqui vale a fiação no `.upgrade()`.
 */

let dbName = ''

afterEach(async () => {
  await Dexie.delete(dbName)
})

/** Schema v20: exclui parentalPins (067) e as tabelas aditivas v22 (069). */
async function v20Stores(): Promise<Record<string, string>> {
  const probe = new CatalogDb(`probe-v20-${Math.random().toString(36).slice(2)}`)
  await probe.open()
  const stores = Object.fromEntries(
    probe.tables
      .filter((table) => !['parentalPins', 'portalDevice', 'licenseCache', 'portalOperations',
        'pendingPortalDeletes', 'sourceRevisions', 'pendingImportOutbox'].includes(table.name))
      .map((table) => [table.name, [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(', ')]),
  )
  probe.close()
  await Dexie.delete(probe.name)
  return stores
}

describe('CatalogDb — v21 (feature 067)', () => {
  it('abrir um banco v20 com PIN único dá o PIN à lista com bloqueio, deixa a outra sem PIN e mantém o bloqueio', async () => {
    dbName = `test-db-v21-${Math.random().toString(36).slice(2)}`
    const legacy = new Dexie(dbName)
    legacy.version(20).stores(await v20Stores())
    await legacy.open()
    for (const id of ['sala', 'quarto']) {
      await legacy.table('sources').put({ id, type: 'provider_credentials', displayName: id, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
    }
    await legacy.table('categories').bulkAdd([
      { sourceId: 'sala', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Ação', order: 0, providerCategoryId: '1' },
      { sourceId: 'sala', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'XXX Adultos', order: 1, providerCategoryId: '2' },
      { sourceId: 'quarto', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Drama', order: 0, providerCategoryId: '3' },
    ])
    const salt = 'aabbccddeeff00112233445566778899'
    await legacy.table('parentalPin').put({ id: 'pin', salt, hash: sha256Hex(new TextEncoder().encode(`${salt}:2468`)), algorithm: 'sha256', createdAt: 1 })
    legacy.close()

    const upgraded = new CatalogDb(dbName)
    await upgraded.open()
    expect(upgraded.verno).toBe(24)
    expect(await upgraded.table('parentalPin').count()).toBe(0)
    expect(await hasPin('sala', upgraded)).toBe(true)
    expect(await verifyPin('sala', '2468', upgraded)).toBe(true)
    expect(await hasPin('quarto', upgraded)).toBe(false)
    const salaLocked = (await listVisibleCategories('sala', 'movie', upgraded)).filter((category) => category.locked)
    expect(salaLocked.map((category) => category.name)).toEqual(['XXX Adultos'])
    upgraded.close()
  })

  it('banco novo (sem PIN antigo) abre na v22 sem nada a migrar', async () => {
    dbName = `test-db-v21-new-${Math.random().toString(36).slice(2)}`
    const fresh = new CatalogDb(dbName)
    await fresh.open()
    expect(await fresh.table('parentalPins').count()).toBe(0)
    fresh.close()
  })
})
