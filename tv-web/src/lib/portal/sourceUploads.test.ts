import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalRequestError } from './portalClient'
import type { PortalConnection } from './portalConnection'
import { portalTables, type PortalDeviceRecord } from './portalTables'
import { flushSourceUploads } from './sourceUploads'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const device = { id: 'device', deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A', deviceKey: '1732049818',
  authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000',
  recoveryCodeVersion: 1, nextSyncAt: 0 } as PortalDeviceRecord

async function seed(count: number) {
  const database = new CatalogDb('test-071-uploads-' + crypto.randomUUID()); databases.push(database)
  const tables = portalTables(database)
  for (let index = 0; index < count; index++) {
    const id = 'lista-' + String(index).padStart(2, '0')
    await database.sources.add({ id, type: 'm3u_url', displayName: 'Lista ' + index, m3uUrl: 'https://lista.invalid/' + index + '.m3u',
      connectionState: 'synced', createdAt: 1, updatedAt: 1 })
    await tables.revisions.put({ sourceId: id, revision: 1 })
  }
  // Incompleta: Xtream sem senha nunca sobe.
  await database.sources.add({ id: 'incompleta', type: 'provider_credentials', displayName: 'Sem senha',
    providerDns: 'https://painel.invalid', providerUsername: 'usuario', connectionState: 'synced', createdAt: 1, updatedAt: 1 })
  await tables.revisions.put({ sourceId: 'incompleta', revision: 1 })
  return { database, tables }
}

const connectionWith = (request: (path: string, options: { body: { sources: { sourceId: string }[] } }) => unknown) =>
  ({ client: { request: vi.fn(request as never) } }) as unknown as PortalConnection & { client: { request: ReturnType<typeof vi.fn> } }

// Feature 071, FR-008/FR-009/FR-010 — lotes de 10, fila durável, parada no 1º erro e retomada pelo próximo Atualizar
it('sobe tudo em lotes de 10; falha de rede para no 1º erro sem perder nada e o Atualizar seguinte só envia o que falta', async () => {
  const { database, tables } = await seed(12)
  let failSecondBatch = true
  const connection = connectionWith(async (_path, options) => {
    if (options.body.sources.length === 2 && failSecondBatch) throw new PortalRequestError('network_error')
    return { results: options.body.sources.map(item => ({ sourceId: item.sourceId, state: 'stored' })) }
  })
  const same = vi.fn(async () => {})

  await expect(flushSourceUploads(database, connection, device, new AbortController().signal, same)).rejects.toThrow('network_error')
  expect(connection.client.request.mock.calls.map(call => (call[1] as { body: { sources: unknown[] } }).body.sources.length)).toEqual([10, 2])
  expect(await tables.uploads.count()).toBe(10)

  // Offline some: a fila é a própria tabela, então o próximo Atualizar manda só as 2 que faltam.
  failSecondBatch = false
  connection.client.request.mockClear()
  expect(await flushSourceUploads(database, connection, device, new AbortController().signal, same)).toBe(2)
  expect(connection.client.request).toHaveBeenCalledTimes(1)
  expect(await tables.uploads.count()).toBe(12)
  expect(await tables.uploads.get('incompleta')).toBeUndefined()

  // Sem mudança: nenhuma requisição. Edição (revisão nova) sobe só a lista editada.
  connection.client.request.mockClear()
  expect(await flushSourceUploads(database, connection, device, new AbortController().signal, same)).toBe(0)
  expect(connection.client.request).not.toHaveBeenCalled()
  await tables.revisions.put({ sourceId: 'lista-03', revision: 2 })
  await flushSourceUploads(database, connection, device, new AbortController().signal, same)
  const sent = (connection.client.request.mock.calls[0][1] as { body: { sources: { sourceId: string; revision: number }[] } }).body.sources
  expect(sent).toEqual([{ sourceId: 'lista-03', revision: 2, input: expect.objectContaining({ type: 'm3u_url' }) }])
})

it('"gone" conta como enviado (não insiste) e "conflict" fica para depois do pull', async () => {
  const { database, tables } = await seed(2)
  const connection = connectionWith(async (_path, options) => ({ results: options.body.sources.map(item => ({
    sourceId: item.sourceId, state: item.sourceId === 'lista-00' ? 'gone' : 'conflict' })) }))
  await flushSourceUploads(database, connection, device, new AbortController().signal, async () => {})
  expect(await tables.uploads.get('lista-00')).toMatchObject({ uploadedRevision: 1 })
  expect(await tables.uploads.get('lista-01')).toBeUndefined()
})
