/** Exclusão atômica local e intenção remota durável; fachada em sourceRepository. */
import { db, type CatalogDb } from './db'
import { deleteAllForSource } from './catalogRepository'
import { deleteUserStatesForSource } from './userStateRepository'
import { deleteEpgForSource } from '../epg/epgRepository'
import { categoryPreferences, parentalPins } from './parentalTables'
import { portalTables } from '../portal/portalTables'
import { notifyLocalSourceChanged } from '../portal/sourceChangeSignal'

/** Remove a fonte e tudo que dependia dela — catálogo de todas as gerações e execuções. */
export function sourceDeletionTables(database: CatalogDb) {
  return ['sources', 'channels', 'categories', 'storedEntries', 'categoryBlocks',
    'catalogReadManifests', 'catalogReadChunks', 'categoryChunks', 'epgChunks', 'seriesWatchMembers', 'seriesWatchSummaries',
    'sectionStaging', 'showcaseCandidates', 'showcaseExternalRows', 'importRuns', 'userStates', 'epgPrograms', 'titleMetadata',
    'categoryPreferences', 'parentalPins', 'externalSubtitles', 'sourceRevisions', 'pendingPortalDeletes',
    'pendingImportOutbox', 'pendingRestore'].map(name => database.table(name))
}

export async function deleteSource(id: string, database: CatalogDb = db,
  options: { origin?: 'tv' | 'portal' } = {}): Promise<void> {
  const deletionId = globalThis.crypto?.randomUUID?.() ??
    'del-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  const deletedAt = Date.now()
  const tables = portalTables(database)
  let removedByPerson = false
  await database.transaction('rw', sourceDeletionTables(database), async () => {
    const previous = await tables.revisions.get(id)
    if (previous?.tombstone) return
    const revision = (previous?.revision ?? 0) + 1
    await deleteAllForSource(id, database)
    await database.importRuns.where('[sourceId+status]').between([id, ''], [id, '￿']).delete()
    // Favoritos e retomada da fonte removida (feature 013, D-007/FR-017) — uma fonte readicionada ganha
    // `sourceId` novo (UUID), então nada aqui fica órfão-mas-recuperável; manter o registro só ocuparia espaço.
    await deleteUserStatesForSource(id, database)
    // Feature 030 (FR-012): a programação e a configuração de EPG (que vive no próprio registro da fonte) saem junto.
    await deleteEpgForSource(id, database)
    // Feature 032 (FR-026): a metadata descritiva da fonte (provedor e TMDB) sai junto; a chave TMDB é da pessoa e fica.
    await database.titleMetadata.where('sourceId').equals(id).delete()
    // Feature 086 (FR-009): as fileiras guardadas são derivadas da lista — saem junto, sem deixar resíduo.
    await Promise.all([
      database.showcaseCandidates.where('sourceId').equals(id).delete(),
      database.showcaseExternalRows.where('sourceId').equals(id).delete(),
      // Feature 090 (FR-021): as legendas guardadas dos itens da lista saem junto (pelo nome: lib/catalog não importa
      // lib/subtitles).
      database.table('externalSubtitles').where('sourceId').equals(id).delete(),
    ])
    // Preferências de categoria (066, FR-005) e o PIN da lista (067, FR-025 — o PIN é por lista desde então).
    await Promise.all([categoryPreferences(database).where('sourceId').equals(id).delete(), parentalPins(database).delete(id)])
    await database.sources.delete(id)
    await tables.imports.delete(id)
    // 072: dados restaurados à espera desta lista não têm mais para onde ir.
    await database.table('pendingRestore').delete(id)
    await tables.revisions.put({ ...previous, sourceId: id, revision, tombstone: true, deletedAt })
    if (options.origin !== 'portal') {
      await tables.deletes.put({ deletionId, sourceId: id, revision, createdAt: deletedAt })
      removedByPerson = true
    }
  })
  // 071/FR-009: a exclusão feita pela pessoa pede o envio no ato; a outbox durável cobre offline e falha.
  if (removedByPerson) notifyLocalSourceChanged('deleted')
}

