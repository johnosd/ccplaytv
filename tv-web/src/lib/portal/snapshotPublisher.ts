/** Snapshot aplicado e allowlist literal; configuração desejada pertence ao servidor. */
import type { CatalogDb } from '../catalog/db'
import { listSources } from '../catalog/sourceRepository'
import { portalTables } from './portalTables'
import { toPortalSourceView, type PortalSourceView } from './remoteConfiguration'

export interface PortalSnapshot {
  capturedAt: string
  sources: PortalSourceView[]
  revisions: { sourceId: string; revision: number }[]
  imports: { sourceId: string; configRevision: number; state: string }[]
}

export async function capturePortalSnapshot(database: CatalogDb, now = Date.now()): Promise<PortalSnapshot> {
  if (!Number.isFinite(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) throw new Error('invalid_snapshot_time')
  const tables = portalTables(database)
  return database.transaction('r', database.sources, tables.revisions, tables.imports, async () => {
    const sources = await listSources(database)
    const revisions = []
    const imports = []
    for (const source of sources) {
      const revision = await tables.revisions.get(source.id)
      if (revision?.tombstone) continue
      revisions.push({ sourceId: source.id, revision: revision?.revision ?? 0 })
      const pending = await tables.imports.get(source.id)
      if (pending) imports.push({ sourceId: source.id, configRevision: pending.configRevision, state: pending.state })
    }
    const allowed = new Set(revisions.map(item => item.sourceId))
    return { capturedAt: new Date(now).toISOString(),
      sources: sources.filter(source => allowed.has(source.id)).map(toPortalSourceView), revisions, imports }
  })
}
