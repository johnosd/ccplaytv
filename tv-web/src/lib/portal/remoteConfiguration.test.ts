import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { createSource, deleteSource, getSource, readCredential, updateSource } from '../catalog/sourceRepository'
import { applyRemoteMutation, type RemoteMutation } from './remoteConfiguration'
import { portalTables } from './portalTables'
import { capturePortalSnapshot } from './snapshotPublisher'
import { drainRemoteImports } from './remoteImportOutbox'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
function database() {
  const db = new CatalogDb('test-069-remote-' + crypto.randomUUID())
  names.push(db.name)
  return db
}
const provider = { type: 'provider_credentials' as const, displayName: 'Fixture',
  providerDns: 'https://provider.example.test', providerUsername: 'fake-user', providerPassword: 'fake-pass' }
const creation: RemoteMutation = { deviceId: 'tv-a', operationId: 'create-a', sourceId: 'source-a',
  expectedRevision: 0, action: 'create', input: provider }

it('digest divergente conflita e replay depois de edição não reimporta nem retrocede revisão', async () => {
  const db = database(), importSource = vi.fn(async () => {})
  const options = { database: db, deviceId: 'tv-a', importSource }
  try {
    await applyRemoteMutation(creation, options)
    expect((await applyRemoteMutation({ ...creation, input: { ...provider, displayName: 'Collision' } }, options)).state).toBe('conflict')
    await applyRemoteMutation({ ...creation, operationId: 'update-a', action: 'update', expectedRevision: 1,
      input: { displayName: 'Updated', providerPassword: '' } }, options)
    expect(await applyRemoteMutation(creation, options)).toEqual({ state: 'applied', sourceId: 'source-a', revision: 1 })
    expect((await portalTables(db).revisions.get('source-a'))?.revision).toBe(2)
    expect((await getSource('source-a', db))?.displayName).toBe('Updated')
    expect((await readCredential('source-a', db))?.password).toBe('fake-pass')
    expect(importSource).toHaveBeenCalledTimes(2)
  } finally { db.close() }
})

it('delete offline domina comando antigo e fonte tombstonada não é recriada', async () => {
  const db = database(), importSource = vi.fn(async () => {})
  const options = { database: db, deviceId: 'tv-a', importSource }
  try {
    await applyRemoteMutation(creation, options)
    await deleteSource('source-a', db)
    expect((await applyRemoteMutation({ ...creation, operationId: 'recreate', expectedRevision: 2 }, options)).state).toBe('conflict')
    await applyRemoteMutation(creation, options)
    expect(await getSource('source-a', db)).toBeUndefined()
    expect(await portalTables(db).deletes.count()).toBe(1)
    expect(importSource).toHaveBeenCalledOnce()
  } finally { db.close() }
})

it('falha de import é separada da aplicação e preserva geração válida anterior', async () => {
  const db = database(), importSource = vi.fn(async () => { throw Error('https://private-provider.test/password') })
  try {
    const sourceId = await createSource(provider, db)
    await db.sources.update(sourceId, { activeGeneration: 77, connectionState: 'synced' })
    const mutation = { ...creation, sourceId, operationId: 'failed-import', action: 'update' as const,
      expectedRevision: 1, input: { displayName: 'Applied' } }
    const options = { database: db, deviceId: 'tv-a', importSource }
    expect((await applyRemoteMutation(mutation, options)).state).toBe('applied')
    expect(await portalTables(db).imports.get(sourceId)).toMatchObject({ state: 'error', configRevision: 2 })
    expect((await getSource(sourceId, db))?.activeGeneration).toBe(77)
    await applyRemoteMutation(mutation, options)
    expect(importSource).toHaveBeenCalledOnce()
    expect(JSON.stringify(await portalTables(db).operations.toArray())).not.toContain('private-provider')
  } finally { db.close() }
})

it('confirmação destrutiva revalida edição local ocorrida enquanto modal estava aberto', async () => {
  const db = database(), importSource = vi.fn(async () => {})
  try {
    const sourceId = await createSource(provider, db)
    const result = await applyRemoteMutation({ ...creation, sourceId, operationId: 'destructive',
      action: 'update', expectedRevision: 1, input: { displayName: 'Remote' } }, {
      database: db, deviceId: 'tv-a', importSource, activeSourceId: sourceId,
      confirmDestructive: async () => { await updateSource(sourceId, { displayName: 'Local' }, db); return true },
    })
    expect(result.state).toBe('conflict')
    expect((await getSource(sourceId, db))?.displayName).toBe('Local')
    expect(importSource).not.toHaveBeenCalled()
  } finally { db.close() }
})

it('snapshot deixa URLs/credenciais/campos futuros fora do envelope e separa revisões/import', async () => {
  const db = database()
  try {
    const sourceId = await createSource(provider, db)
    await db.sources.update(sourceId, { epgManualUrl: 'https://epg.example.test/secret',
      ...({ futureSecret: 'fixture-new-secret' } as object) })
    await portalTables(db).imports.put({ sourceId, operationId: 'fixture', configRevision: 1, state: 'running' })
    const snapshot = await capturePortalSnapshot(db, 1_000)
    expect(snapshot.capturedAt).toBe('1970-01-01T00:00:01.000Z')
    expect(snapshot.revisions).toEqual([{ sourceId, revision: 1 }])
    expect(snapshot.imports).toEqual([{ sourceId, configRevision: 1, state: 'running' }])
    expect(Object.keys(snapshot.sources[0]).sort()).toEqual(['connectionState', 'displayName', 'id', 'type', 'updatedAt'])
    expect(JSON.stringify(snapshot)).not.toMatch(/fake-|providerDns|epgManualUrl|futureSecret|fixture-new-secret/)
  } finally { db.close() }
})


it('complemento EPG remoto preserva vazio e só limpa campo opcional explicitamente', async () => {
  const db = database(), importSource = vi.fn(async () => {})
  const options = { database: db, deviceId: 'tv-a', importSource }
  try {
    await applyRemoteMutation({ ...creation, input: { ...provider,
      epgManualUrl: 'https://epg.example.test/private.xml', epgOffsetHours: 2 } }, options)
    await applyRemoteMutation({ ...creation, operationId: 'keep-epg', action: 'update', expectedRevision: 1,
      input: { epgManualUrl: '', providerPassword: '' } }, options)
    expect(await db.sources.get('source-a')).toMatchObject({ epgManualUrl: 'https://epg.example.test/private.xml', epgOffsetHours: 2 })
    await applyRemoteMutation({ ...creation, operationId: 'clear-epg', action: 'update', expectedRevision: 2,
      input: { clearFields: ['epgManualUrl'], epgDisabled: true } }, options)
    expect((await db.sources.get('source-a'))?.epgManualUrl).toBeUndefined()
    expect((await readCredential('source-a', db))?.password).toBe('fake-pass')
    const invalid = { ...creation, operationId: 'invalid', action: 'update' as const, expectedRevision: 3,
      input: { epgManualUrl: 'javascript:private' } }
    await expect(applyRemoteMutation(invalid, options)).rejects.toThrow('invalid_remote_mutation')
    expect((await portalTables(db).revisions.get('source-a'))?.revision).toBe(3)
  } finally { db.close() }
})


it('crash após commit antes do import deixa recibo/outbox e não duplica fonte no retry', async () => {
  let db = database()
  const name = db.name
  const failedAt = Date.now()
  try {
    await expect(applyRemoteMutation(creation, { database: db, deviceId: 'tv-a', importSource: async () => {
      db.close({ disableAutoOpen: true })
      throw Error('fixture-process-ended')
    } })).rejects.toThrow()
    db = new CatalogDb(name)
    expect(await db.sources.count()).toBe(1)
    expect((await portalTables(db).operations.get(creation.operationId))?.result.state).toBe('applied')
    const importer = vi.fn(async () => {})
    await drainRemoteImports(db, importer, creation.sourceId, () => failedAt + 120_000)
    await applyRemoteMutation(creation, { database: db, deviceId: 'tv-a', importSource: importer })
    expect(importer).toHaveBeenCalledExactlyOnceWith(creation.sourceId)
    expect(await db.sources.count()).toBe(1)
  } finally { db.close() }
})
