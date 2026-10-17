/** Snapshot aplicado e allowlist literal; configuração desejada pertence ao servidor. */
import type { CatalogDb } from '../catalog/db'
import { listSources } from '../catalog/sourceRepository'
import { getTmdbStatus } from '../metadata/tmdbKeyRepository'
import { portalTables } from './portalTables'
import { toPortalSourceView, type PortalSourceView } from './remoteConfiguration'

export interface PortalSnapshot {
  capturedAt: string
  sources: PortalSourceView[]
  revisions: { sourceId: string; revision: number }[]
  imports: { sourceId: string; configRevision: number; state: string }[]
  /** 077: só se há chave TMDB guardada na TV, nunca o valor, o formato nem o fim da chave. */
  integrations: { tmdb: 'none' | 'configured' }
}

/** Teto do serviço por snapshot (`SnapshotInput`: sources, revisions e imports com no máximo 50). */
export const MAX_SNAPSHOT_SOURCES = 50

export async function capturePortalSnapshot(database: CatalogDb, now = Date.now()): Promise<PortalSnapshot> {
  if (!Number.isFinite(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) throw new Error('invalid_snapshot_time')
  const tables = portalTables(database)
  const tmdb = (await getTmdbStatus({ database })).state === 'not_configured' ? 'none' as const : 'configured' as const
  return database.transaction('r', database.sources, tables.revisions, tables.imports, async () => {
    const sources = await listSources(database)
    const revisions = []
    const imports = []
    for (const source of sources) {
      // 071/C-01: mais de 50 listas não podem derrubar o Atualizar; o serviço recusaria o snapshot inteiro (422).
      if (revisions.length >= MAX_SNAPSHOT_SOURCES) break
      const revision = await tables.revisions.get(source.id)
      if (revision?.tombstone) continue
      revisions.push({ sourceId: source.id, revision: revision?.revision ?? 0 })
      const pending = await tables.imports.get(source.id)
      if (pending) imports.push({ sourceId: source.id, configRevision: pending.configRevision, state: pending.state })
    }
    const allowed = new Set(revisions.map(item => item.sourceId))
    return { capturedAt: new Date(now).toISOString(),
      sources: sources.filter(source => allowed.has(source.id)).map(toPortalSourceView), revisions, imports,
      integrations: { tmdb } }
  })
}
