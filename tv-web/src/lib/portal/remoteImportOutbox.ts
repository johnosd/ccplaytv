/** Importação local durável; aceitação de configuração e conclusão são estados distintos. */
import { liveQuery } from 'dexie'
import { db, type CatalogDb } from '../catalog/db'
import { runImport } from '../catalog/importRunner'
import { ImportAlreadyRunningError, ABANDONED_AFTER_MS } from '../catalog/importPipeline'
import { portalTables, type PendingImportRecord } from './portalTables'
import { clearRemoteImport, markRemoteImportRunning } from './remoteImportsInFlight'

export interface RemoteImportHandle {
  runId: string
  completion: Promise<{ status: string }>
  cancel(): void
}
export type ImportRemoteSource = (sourceId: string) => Promise<void | RemoteImportHandle>
const drains = new WeakMap<CatalogDb, Promise<void>>()

async function finish(database: CatalogDb, claimed: PendingImportRecord, state: 'completed' | 'error') {
  const table = portalTables(database).imports
  await database.transaction('rw', table, async () => {
    const current = await table.get(claimed.sourceId)
    if (current?.operationId !== claimed.operationId || current.configRevision !== claimed.configRevision ||
        current.owner !== claimed.owner) return
    await table.put({ ...current, state, owner: undefined, leaseUntil: undefined })
  })
}

export function localImportSource(database: CatalogDb): ImportRemoteSource {
  return async sourceId => {
    if (database !== db) throw new Error('default_import_database_required')
    const pending = await portalTables(database).imports.get(sourceId)
    if (!pending) throw new Error('remote_import_missing')
    // Produção usa o Worker/default DB. Bancos de teste usam o colaborador de
    // importação do teste; nunca apontar um Worker para outro banco implicitamente.
    return runImport(sourceId, { remote: { operationId: pending.operationId,
      configRevision: pending.configRevision } })
  }
}

export async function drainRemoteImports(database: CatalogDb, importSource: ImportRemoteSource,
  sourceId?: string, now: () => number = Date.now): Promise<void> {
  const existing = drains.get(database)
  if (existing) {
    await existing
    // A operação que chegou enquanto o dreno rodava pode ser de outra fonte.
    return drainRemoteImports(database, importSource, sourceId, now)
  }
  const work = drain(database, importSource, sourceId, now)
  drains.set(database, work)
  try { await work } finally { if (drains.get(database) === work) drains.delete(database) }
}

async function drain(database: CatalogDb, importSource: ImportRemoteSource, sourceId: string | undefined,
  now: () => number) {
  const tables = portalTables(database)
  const candidates = sourceId ? [await tables.imports.get(sourceId)].filter(Boolean) as PendingImportRecord[]
    : await tables.imports.where('state').anyOf('queued', 'running').limit(5).toArray()
  for (const candidate of candidates) {
    const owner = crypto.randomUUID()
    const claimed = await database.transaction('rw', tables.imports, tables.revisions,
      database.sources, database.importRuns, async () => {
        const pending = await tables.imports.get(candidate.sourceId)
        if (!pending || pending.state === 'completed' || pending.state === 'error') return undefined
        const revision = await tables.revisions.get(pending.sourceId)
        if (revision?.tombstone || revision?.revision !== pending.configRevision ||
            !await database.sources.get(pending.sourceId)) {
          await tables.imports.delete(pending.sourceId)
          return undefined
        }
        if (pending.runId) {
          const run = await database.importRuns.get(pending.runId)
          if (run?.status === 'completed') {
            await tables.imports.put({ ...pending, state: 'completed', owner: undefined, leaseUntil: undefined })
            return undefined
          }
          if (run?.status === 'running' && now() - (run.heartbeatAt ?? run.startedAt) <= ABANDONED_AFTER_MS) return undefined
          if (run && run.status !== 'running' && run.errorKind !== 'interrupted') {
            await tables.imports.put({ ...pending, state: 'error', owner: undefined, leaseUntil: undefined })
            return undefined
          }
        }
        if ((pending.leaseUntil ?? 0) > now()) return undefined
        const claimed = { ...pending, state: 'running' as const, owner, leaseUntil: now() + 60_000 }
        await tables.imports.put(claimed)
        return claimed
      })
    if (!claimed) continue
    try {
      const handle = await importSource(claimed.sourceId)
      if (!handle) { await finish(database, claimed, 'completed'); continue }
      // 071/A008: a tela de listas consulta este registro para mostrar o progresso na 1ª entrada da lista nova.
      markRemoteImportRunning(claimed.sourceId, handle.runId)
      // Pipeline já vincula runId no mesmo commit de criação do run. O set
      // abaixo também permite colaboradores locais com a mesma interface.
      await database.transaction('rw', tables.imports, async () => {
        const current = await tables.imports.get(claimed.sourceId)
        if (current?.operationId === claimed.operationId && current.owner === claimed.owner) {
          await tables.imports.put({ ...current, runId: handle.runId })
        }
      })
      const subscription = liveQuery(async () => ({ pending: await tables.imports.get(claimed.sourceId),
        revision: await tables.revisions.get(claimed.sourceId) })).subscribe({
        next: ({ pending, revision }) => {
          if (!pending || pending.operationId !== claimed.operationId || pending.configRevision !== claimed.configRevision ||
              revision?.tombstone || revision?.revision !== claimed.configRevision) {
            handle.cancel()
          }
        },
        error: () => handle.cancel(),
      })
      // Trabalho local mantém outbox/run duráveis. Fechar o app perde somente o
      // observador: novo dreno reconcilia runId/heartbeat antes de iniciar efeito.
      void handle.completion.then(
        run => finish(database, claimed, run.status === 'completed' ? 'completed' : 'error'),
        () => finish(database, claimed, 'error'),
      ).catch(() => {}).finally(() => { subscription.unsubscribe(); clearRemoteImport(claimed.sourceId, handle.runId) })
    } catch (error) {
      if (error instanceof ImportAlreadyRunningError) {
        await database.transaction('rw', tables.imports, async () => {
          const current = await tables.imports.get(claimed.sourceId)
          if (current?.operationId === claimed.operationId && current.owner === claimed.owner) {
            await tables.imports.put({ ...current, state: 'queued', owner: undefined, leaseUntil: now() + 5_000 })
          }
        })
      } else await finish(database, claimed, 'error')
    }
  }
}
