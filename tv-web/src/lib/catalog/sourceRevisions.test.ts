import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { createSource, deleteSource, getSource, readCredential, updateSource } from './sourceRepository'
import { portalTables } from '../portal/portalTables'
import { setEpgManualUrl, setEpgOffsetHours, setEpgEnabled } from '../epg/epgRepository'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
function database() {
  const db = new CatalogDb('test-069-revisions-' + crypto.randomUUID())
  names.push(db.name)
  return db
}
const provider = { type: 'provider_credentials' as const, displayName: 'Fixture',
  providerDns: 'https://provider.example.test', providerUsername: 'fake-user', providerPassword: 'fake-pass' }

it('ID remoto explícito e revisões serializam edições, sem perder credencial omitida', async () => {
  const db = database()
  try {
    const id = await createSource(provider, db, { sourceId: 'remote-source' })
    expect(id).toBe('remote-source')
    expect((await portalTables(db).revisions.get(id))?.revision).toBe(1)
    await Promise.all([updateSource(id, { displayName: 'One' }, db), updateSource(id, { displayName: 'Two' }, db)])
    expect((await portalTables(db).revisions.get(id))?.revision).toBe(3)
    expect((await readCredential(id, db))?.password).toBe('fake-pass')
    await expect(createSource(provider, db, { sourceId: id })).rejects.toThrow('Identificador já utilizado.')
  } finally { db.close() }
})

it('remoção local grava tombstone/outbox e cancela import, sem afetar outra lista ou licença', async () => {
  const db = database()
  try {
    const first = await createSource(provider, db)
    const second = await createSource({ ...provider, displayName: 'Second' }, db)
    const tables = portalTables(db)
    await tables.imports.put({ sourceId: first, configRevision: 1, operationId: 'pending', state: 'queued' })
    await tables.license.put({ id: 'entitlement', deviceId: 'fixture', jws: 'fixture', generation: 1,
      timeHighWatermark: 1, signedServerTime: 1, lastSuccessfulSync: 1, nextDueAt: 2 })
    await deleteSource(first, db)
    expect(await getSource(first, db)).toBeUndefined()
    expect(await getSource(second, db)).toBeDefined()
    expect(await tables.imports.get(first)).toBeUndefined()
    expect(await tables.revisions.get(first)).toMatchObject({ revision: 2, tombstone: true })
    const outbox = await tables.deletes.where('sourceId').equals(first).toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ sourceId: first, revision: 2 })
    expect(JSON.stringify(outbox)).not.toMatch(/fake-pass|providerDns|providerUsername/)
    await deleteSource(first, db)
    expect(await tables.deletes.count()).toBe(1)
    expect(await tables.license.get('entitlement')).toBeDefined()
    await expect(createSource(provider, db, { sourceId: first })).rejects.toThrow('Identificador já utilizado.')
  } finally { db.close() }
})

it('falha da outbox aborta toda remoção e preserva fonte/revisão/import pendente', async () => {
  const db = database()
  const tables = portalTables(db)
  const fail = () => { throw Error('fixture-write-failure') }
  try {
    const id = await createSource(provider, db)
    await tables.imports.put({ sourceId: id, configRevision: 1, operationId: 'pending', state: 'queued' })
    tables.deletes.hook('creating', fail)
    await expect(deleteSource(id, db)).rejects.toThrow('fixture-write-failure')
    expect(await getSource(id, db)).toBeDefined()
    expect(await tables.revisions.get(id)).toEqual({ sourceId: id, revision: 1 })
    expect(await tables.imports.get(id)).toBeDefined()
    expect(await tables.deletes.count()).toBe(0)
  } finally { tables.deletes.hook('creating').unsubscribe(fail); db.close() }
})


it('edições locais de EPG também invalidam a revisão remota sem apagar outra configuração', async () => {
  const db = database()
  try {
    const id = await createSource(provider, db)
    await setEpgManualUrl(id, 'https://epg.example.test/fixture.xml', db)
    await setEpgOffsetHours(id, 2, db)
    await setEpgEnabled(id, false, db)
    expect((await portalTables(db).revisions.get(id))?.revision).toBe(4)
    expect(await db.sources.get(id)).toMatchObject({ epgManualUrl: 'https://epg.example.test/fixture.xml',
      epgOffsetHours: 2, epgDisabled: true })
    expect((await readCredential(id, db))?.password).toBe('fake-pass')
  } finally { db.close() }
})
