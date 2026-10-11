/** Reserva atômica por fonte, comum à thread principal e ao Worker. */
import type { CatalogDb, ImportRunRecord } from './db'
import { allocateGeneration } from './catalogRepository'
import { sourceDeletionTables } from './sourceDeletion'
import { portalTables } from '../portal/portalTables'

export interface RemoteImportRequest { operationId: string; configRevision: number }

export class ImportAlreadyRunningError extends Error {
  constructor() {
    super('Já existe uma importação em andamento para esta fonte.')
    this.name = 'ImportAlreadyRunningError'
  }
}

export class ImportCancelledError extends Error {
  constructor() {
    super('Importação cancelada.')
    this.name = 'ImportCancelledError'
  }
}

export async function withImportPublication<T>(sourceId: string, database: CatalogDb,
  expectedRevision: number, publish: () => Promise<T>): Promise<T> {
  return database.transaction('rw', sourceDeletionTables(database), async () => {
    const revision = await portalTables(database).revisions.get(sourceId)
    if (!await database.sources.get(sourceId) || revision?.tombstone ||
        (revision?.revision ?? 0) !== expectedRevision) throw new ImportCancelledError()
    return publish()
  })
}

export async function reserveImportRun(sourceId: string, database: CatalogDb, now: () => number,
  abandonedAfter: number, closeAbandoned: (run: ImportRunRecord, db: CatalogDb, at: number) => Promise<ImportRunRecord>,
  remote?: RemoteImportRequest) {
  return database.transaction('rw', sourceDeletionTables(database), async () => {
    const source = await database.sources.get(sourceId)
    if (!source) throw new Error('Fonte não encontrada.')
    const tables = portalTables(database)
    const revision = await tables.revisions.get(sourceId)
    const pending = remote ? await tables.imports.get(sourceId) : undefined
    if (remote) {
      if (!pending || pending.operationId !== remote.operationId || pending.configRevision !== remote.configRevision ||
          revision?.tombstone || revision?.revision !== remote.configRevision) throw new Error('remote_import_superseded')
      if (pending.runId) {
        const previous = await database.importRuns.get(pending.runId)
        if (previous?.status === 'completed') throw new Error('remote_import_completed')
      }
    }
    const active = await database.importRuns.where('[sourceId+status]').equals([sourceId, 'running']).first()
    if (active) {
      if (now() - (active.heartbeatAt ?? active.startedAt) <= abandonedAfter) throw new ImportAlreadyRunningError()
      await closeAbandoned(active, database, now())
    }
    // Floor persistido sobrevive ao descarte de uma geração parcial;
    // uma limpeza tardia nunca deve atingir a geração de uma nova tentativa.
    const generation = Math.max(await allocateGeneration(sourceId, database),
      (revision?.importGenerationFloor ?? 0) + 1, (active?.generation ?? 0) + 1)
    const startedAt = now()
    const run: ImportRunRecord = {
      id: 'run-' + startedAt.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      sourceId, generation, status: 'running', step: 'fetching', entriesRead: 0,
      channelsStored: 0, discardedByType: 0, invalidCount: 0, truncatedByStorage: false,
      startedAt, heartbeatAt: startedAt, stepStartedAt: { fetching: startedAt },
    }
    await database.importRuns.add(run)
    await tables.revisions.put({ ...revision, sourceId, revision: revision?.revision ?? 0,
      importGenerationFloor: generation })
    if (pending) await tables.imports.put({ ...pending, state: 'running', runId: run.id })
    return { source, generation, run, configRevision: revision?.revision ?? 0 }
  })
}
