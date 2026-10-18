import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { hasStorageHeadroom, protectCatalogSource, releaseCatalogSpace, releaseEmergencySpace, storageHeadroom, withStorageRelief } from './storageRelief'
import { StorageFullError } from './catalogRepository'
import { storeLicense } from '../licensing/licenseRepository'

// Bug `armazenamento-app-cheio-na-tv-impede` (2026-10-18): com o IndexedDB cheio, a licença paga, o pareamento e o
// desvincular abortavam (`AbortError` + `QuotaExceededError`). Estes testes travam a liberação e a nova tentativa.

const databases: CatalogDb[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const quota = () => Object.assign(new Error('quota'), { name: 'AbortError', inner: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) })

async function seeded() {
  const database = new CatalogDb('test-storage-relief-' + crypto.randomUUID())
  databases.push(database)
  for (const id of ['ativa', 'outra']) {
    await database.sources.put({ id, type: 'provider', displayName: id } as unknown as SourceRecord)
    const categoryId = await database.categories.add({ sourceId: id, generation: 1, kind: 'channel', fetchMode: 'on_demand',
      providerCategoryId: '1', name: 'Canais', order: 0, itemsFetchedAt: 1 })
    await database.categoryBlocks.put({ categoryId: categoryId as number, sourceId: id, generation: 1, kind: 'channel', groupOrder: 0, items: [] })
    // Categoria `eager` vem da importação e não volta sozinha: nunca sai.
    const eager = await database.categories.add({ sourceId: id, generation: 1, kind: 'channel', fetchMode: 'eager', name: 'Fixos', order: 1, itemsFetchedAt: 1 })
    await database.categoryBlocks.put({ categoryId: eager as number, sourceId: id, generation: 1, kind: 'channel', groupOrder: 1, items: [] })
  }
  await database.userStates.put({ stableId: 'outra:live:1', sourceId: 'outra', favoritedAt: 1 } as never)
  await database.table('discoveryCache').put({ id: 'pt:movie' })
  return database
}

it('libera só cache refazível de listas não ativas; lista ativa, categorias eager e estado da pessoa ficam', async () => {
  const database = await seeded()
  const released = await releaseCatalogSpace(database, 'ativa')
  expect(released).toEqual(['discovery', 'inactive-lists'])
  const categories = await database.categories.toArray()
  const outra = categories.filter((row) => row.sourceId === 'outra')
  const ativa = categories.filter((row) => row.sourceId === 'ativa')
  expect(outra.find((row) => row.fetchMode === 'on_demand')?.itemsFetchedAt).toBeUndefined()
  expect(outra.find((row) => row.fetchMode === 'eager')?.itemsFetchedAt).toBe(1)
  expect(ativa.every((row) => row.itemsFetchedAt === 1)).toBe(true)
  const blocks = await database.categoryBlocks.toArray()
  expect(blocks.filter((row) => row.sourceId === 'ativa')).toHaveLength(2)
  expect(blocks.filter((row) => row.sourceId === 'outra')).toHaveLength(1)
  expect(await database.userStates.count()).toBe(1)
  expect(await database.sources.count()).toBe(2)
  // Nada mais a liberar: a segunda rodada não inventa espaço.
  expect(await releaseCatalogSpace(database, 'ativa')).toEqual([])
})

it('gravação crítica que bate na cota libera espaço e grava na segunda tentativa; sem nada a liberar, StorageFullError', async () => {
  const database = await seeded()
  const write = vi.fn<() => Promise<string>>().mockRejectedValueOnce(quota()).mockResolvedValueOnce('gravado')
  await expect(withStorageRelief(write, database)).resolves.toBe('gravado')
  expect(write).toHaveBeenCalledTimes(2)
  const empty = new CatalogDb('test-storage-relief-empty-' + crypto.randomUUID())
  databases.push(empty)
  await expect(withStorageRelief(() => Promise.reject(quota()), empty)).rejects.toBeInstanceOf(StorageFullError)
  // Outros erros não são engolidos nem repetidos.
  const other = vi.fn<() => Promise<void>>().mockRejectedValue(new TypeError('outro'))
  await expect(withStorageRelief(other, database)).rejects.toThrow('outro')
  expect(other).toHaveBeenCalledOnce()
})

it('a licença recebida é gravada mesmo quando a primeira transação estoura a cota', async () => {
  const database = await seeded()
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  const b64 = (value: Uint8Array | string) => btoa(typeof value === 'string' ? value : String.fromCharCode(...value))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1)))
  const input = b64(canonical({ alg: 'ES256', kid: 'k1', typ: 'JWT' })) + '.' + b64(canonical({ aud: 'ccplaytv', deviceId: 'tv-1',
    expiresAt: 2_000_000_000_000, generation: 2, iss: 'ccplaytv-portal', serverTime: 1_800_000_000_000, startsAt: 1_700_000_000_000, state: 'active' }))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(input)))
  const jws = input + '.' + b64(signature)
  await database.table('portalDevice').put({ id: 'device', deviceId: 'tv-1' })
  const original = database.transaction.bind(database)
  let calls = 0
  vi.spyOn(database, 'transaction').mockImplementation(((...args: unknown[]) => {
    calls += 1
    // Só a 1ª transação de gravação da licença estoura; a liberação e a nova tentativa usam o banco real.
    if (calls === 1) return Promise.reject(quota())
    return (original as (...rest: unknown[]) => unknown)(...args)
  }) as never)
  const saved = await storeLicense(database, jws, { issuer: 'ccplaytv-portal', audience: 'ccplaytv', deviceId: 'tv-1',
    keys: { k1: jwk }, minimumGeneration: 0 }, 1_800_000_000_000)
  expect(saved.entitlement.state).toBe('active')
  expect((await database.table('licenseCache').get('entitlement'))?.generation).toBe(2)
})

it('folga da pré-carga: para antes de encher; sem estimativa do navegador, não bloqueia', async () => {
  const quotaBytes = 2 * 1024 ** 3
  expect(storageHeadroom(quotaBytes)).toBe(quotaBytes * 0.1)
  // TV de referência: cota de ~80 MB (medido) → folga de 8 MB, sem desligar a pré-carga.
  expect(storageHeadroom(80 * 1024 ** 2)).toBe(8 * 1024 ** 2)
  expect(await hasStorageHeadroom({ usage: 60 * 1024 ** 2, quota: 80 * 1024 ** 2 })).toBe(true)
  expect(await hasStorageHeadroom({ usage: 75 * 1024 ** 2, quota: 80 * 1024 ** 2 })).toBe(false)
  expect(await hasStorageHeadroom({ usage: quotaBytes * 0.5, quota: quotaBytes })).toBe(true)
  expect(await hasStorageHeadroom({ usage: quotaBytes * 0.95, quota: quotaBytes })).toBe(false)
  vi.stubGlobal('navigator', {})
  expect(await hasStorageHeadroom()).toBe(true)
  vi.unstubAllGlobals()
})

// Adendo de 2026-10-18 (cota de ~80 MB na TV): liberar só listas não ativas não bastou. Em emergência, a gravação
// crítica libera a programação (marcada como não sincronizada, configuração preservada) e o cache da lista ativa.
it('emergência libera EPG e o cache da lista ativa só depois do nível normal falhar; estado da pessoa fica', async () => {
  const database = await seeded()
  await database.sources.update('ativa', { epgActiveGeneration: 3, epgLastSyncAt: 50, epgUrl: 'https://epg.fixture.test/a.xml' } as never)
  await database.table('epgPrograms').add({ sourceId: 'ativa', generation: 3, channelKey: 'c', start: 1, stop: 2, title: 'x' })
  protectCatalogSource('ativa')
  const seen: (number | undefined)[] = []
  // Na 2ª tentativa (depois do nível normal) só as listas não ativas saíram: a ativa ainda tem itens.
  const write = vi.fn<() => Promise<string>>().mockRejectedValueOnce(quota()).mockImplementationOnce(async () => {
    seen.push((await database.categories.where('sourceId').equals('ativa').toArray()).find((row) => row.fetchMode === 'on_demand')?.itemsFetchedAt)
    throw quota()
  }).mockResolvedValueOnce('gravado')
  try { await expect(withStorageRelief(write, database)).resolves.toBe('gravado') } finally { protectCatalogSource(undefined) }
  expect(write).toHaveBeenCalledTimes(3)
  expect(seen).toEqual([1])
  expect(await releaseEmergencySpace(database, 'ativa')).toEqual([])
  const ativa = await database.sources.get('ativa') as unknown as Record<string, unknown>
  expect([ativa.epgActiveGeneration, ativa.epgLastSyncAt, ativa.epgUrl]).toEqual([undefined, undefined, 'https://epg.fixture.test/a.xml'])
  expect(await database.table('epgPrograms').count()).toBe(0)
  const categories = await database.categories.where('sourceId').equals('ativa').toArray()
  expect(categories.find((row) => row.fetchMode === 'on_demand')?.itemsFetchedAt).toBeUndefined()
  expect(categories.find((row) => row.fetchMode === 'eager')?.itemsFetchedAt).toBe(1)
  expect(await database.userStates.count()).toBe(1)
})