import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb, type ImportRunRecord } from './db'
import { createSource, updateSource } from './sourceRepository'
import { reserveImportRun, ImportAlreadyRunningError, withImportPublication } from './importReservation'
import { portalTables } from '../portal/portalTables'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
async function fixture() {
  const db = new CatalogDb('test-069-reservation-' + crypto.randomUUID())
  names.push(db.name)
  const sourceId = await createSource({ type: 'm3u_url', displayName: 'Fixture', m3uUrl: 'https://provider.example.test/list' }, db)
  return { db, sourceId }
}
async function close(run: ImportRunRecord, db: CatalogDb, at: number) {
  const closed = { ...run, status: 'failed' as const, errorKind: 'interrupted' as const, finishedAt: at }
  await db.importRuns.put(closed)
  return closed
}

it('duas reservas concorrentes criam somente um run sem consumir outro floor', async () => {
  const { db, sourceId } = await fixture()
  try {
    const results = await Promise.allSettled([1, 2].map(() => reserveImportRun(sourceId, db, () => 1_000, 60_000, close)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(ImportAlreadyRunningError) })
    expect(await db.importRuns.count()).toBe(1)
    expect((await portalTables(db).revisions.get(sourceId))?.importGenerationFloor).toBe(1)
  } finally { db.close() }
})

it('run abandonado recebe nova geração mesmo sem catálogo parcial, mantendo revisão de configuração', async () => {
  const { db, sourceId } = await fixture()
  try {
    const first = await reserveImportRun(sourceId, db, () => 1_000, 60_000, close)
    const next = await reserveImportRun(sourceId, db, () => 62_000, 60_000, close)
    expect(next.generation).toBe(2)
    expect((await db.importRuns.get(first.run.id))?.status).toBe('failed')
    expect(await portalTables(db).revisions.get(sourceId)).toMatchObject({ revision: 1, importGenerationFloor: 2 })
  } finally { db.close() }
})

it('run remoto e outbox são ligados no mesmo commit e revisão divergente não inicia efeito', async () => {
  const { db, sourceId } = await fixture()
  try {
    const table = portalTables(db).imports
    await table.put({ sourceId, configRevision: 1, operationId: 'op-a', state: 'queued' })
    await expect(reserveImportRun(sourceId, db, () => 1_000, 60_000, close,
      { operationId: 'op-a', configRevision: 2 })).rejects.toThrow('remote_import_superseded')
    expect(await db.importRuns.count()).toBe(0)
    const claimed = await reserveImportRun(sourceId, db, () => 1_000, 60_000, close,
      { operationId: 'op-a', configRevision: 1 })
    expect(await table.get(sourceId)).toMatchObject({ runId: claimed.run.id, state: 'running' })
    expect(await db.importRuns.get(claimed.run.id)).toBeDefined()
  } finally { db.close() }
})


it('publicação revalida revisão e aborta estado terminal junto do catálogo', async () => {
  const { db, sourceId } = await fixture()
  try {
    const claimed = await reserveImportRun(sourceId, db, () => 1_000, 60_000, close)
    const publish = vi.fn(async () => {})
    await updateSource(sourceId, { displayName: 'Local edit' }, db)
    await expect(withImportPublication(sourceId, db, claimed.configRevision, publish)).rejects.toThrow('Importação cancelada.')
    expect(publish).not.toHaveBeenCalled()
    await expect(withImportPublication(sourceId, db, 2, async () => {
      await db.sources.update(sourceId, { activeGeneration: 99 })
      await db.importRuns.update(claimed.run.id, { status: 'completed' })
      throw Error('fixture-publication-crash')
    })).rejects.toThrow('fixture-publication-crash')
    expect((await db.sources.get(sourceId))?.activeGeneration).toBeUndefined()
    expect((await db.importRuns.get(claimed.run.id))?.status).toBe('running')
  } finally { db.close() }
})
