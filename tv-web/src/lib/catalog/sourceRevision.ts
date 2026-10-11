/** Alterações locais de configuração participam da revisão usada pelo portal. */
import { db, type CatalogDb, type SourceRecord } from './db'
import { portalTables } from '../portal/portalTables'

export async function updateSourceConfiguration(id: string, patch: Partial<SourceRecord>, database: CatalogDb = db) {
  const tables = portalTables(database)
  return database.transaction('rw', database.sources, tables.revisions, async () => {
    if (!await database.sources.get(id)) return false
    const revision = await tables.revisions.get(id)
    if (revision?.tombstone) return false
    await database.sources.update(id, patch)
    await tables.revisions.put({ ...revision, sourceId: id, revision: (revision?.revision ?? 0) + 1 })
    return true
  })
}
