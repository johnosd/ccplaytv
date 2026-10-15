import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { createSource, deleteSource, updateSource } from '../catalog/sourceRepository'
import { portalTables } from './portalTables'
import { drainRemoteImports } from './remoteImportOutbox'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
async function fixture() {
  const db = new CatalogDb('test-069-outbox-' + crypto.randomUUID())
  names.push(db.name)
  const sourceId = await createSource({ type: 'm3u_url', displayName: 'Fixture', m3uUrl: 'https://provider.example.test/list' }, db)
  await portalTables(db).imports.put({ sourceId, operationId: 'op-a', configRevision: 1, state: 'queued' })
  return { db, sourceId }
}

it('drenos simultâneos não repetem efeito já concluído', async () => {
  const { db, sourceId } = await fixture()
  try {
    const importer = vi.fn(async () => {})
    await Promise.all([drainRemoteImports(db, importer), drainRemoteImports(db, importer)])
    expect(importer).toHaveBeenCalledExactlyOnceWith(sourceId)
    expect((await portalTables(db).imports.get(sourceId))?.state).toBe('completed')
  } finally { db.close() }
})

it('crash após run concluído antes de marcar outbox não baixa novamente após reabrir', async () => {
  let { db, sourceId } = await fixture()
  try {
    await db.importRuns.put({ id: 'run-finished', sourceId, generation: 1, status: 'completed',
      step: 'done', startedAt: 1, finishedAt: 2, entriesRead: 1, channelsStored: 1,
      discardedByType: 0, invalidCount: 0, truncatedByStorage: false })
    await portalTables(db).imports.put({ sourceId, operationId: 'op-a', configRevision: 1,
      state: 'running', runId: 'run-finished', owner: 'previous-process', leaseUntil: 10 })
    const name = db.name
    db.close()
    db = new CatalogDb(name)
    const importer = vi.fn(async () => {})
    await drainRemoteImports(db, importer, sourceId, () => 100)
    expect(importer).not.toHaveBeenCalled()
    expect((await portalTables(db).imports.get(sourceId))?.state).toBe('completed')
  } finally { db.close() }
})

it('remoção commitada cancela import local em curso sem recriar outbox ao concluir', async () => {
  const { db, sourceId } = await fixture()
  let complete!: (run: { status: string }) => void
  const completion = new Promise<{ status: string }>(resolve => { complete = resolve })
  const cancel = vi.fn(() => complete({ status: 'cancelled' }))
  try {
    await drainRemoteImports(db, async () => ({ runId: 'fixture-running', completion, cancel }))
    await deleteSource(sourceId, db)
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled(), { timeout: 2_000 })
    await vi.waitFor(async () => expect(await portalTables(db).imports.get(sourceId)).toBeUndefined())
    expect(await db.sources.get(sourceId)).toBeUndefined()
  } finally { complete({ status: 'cancelled' }); db.close() }
})


it('edição local cancela import de uma revisão anterior', async () => {
  const { db, sourceId } = await fixture()
  let complete!: (run: { status: string }) => void
  const completion = new Promise<{ status: string }>(resolve => { complete = resolve })
  const cancel = vi.fn(() => complete({ status: 'cancelled' }))
  try {
    await drainRemoteImports(db, async () => ({ runId: 'fixture-running', completion, cancel }))
    await updateSource(sourceId, { displayName: 'Local' }, db)
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled(), { timeout: 2_000 })
    expect((await db.sources.get(sourceId))?.displayName).toBe('Local')
  } finally { complete({ status: 'cancelled' }); db.close() }
})
