/** Feature 072: estado local do backup (`portalDevice`, id `backup`) e tabela de pendências (`data-model.md` §1). */
import type { Table } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import type { BackupState, PendingRestoreRecord, UsageBackupCounts } from './usageBackupTypes'

export interface BackupStateRecord {
  id: 'backup'
  state: BackupState
  lastBackupAt?: number
  /** Backup existente no serviço ainda não decidido pela pessoa (estado `offered`). */
  offer?: { createdAt: number; counts: UsageBackupCounts; dismissed?: boolean }
}

export function backupTables(database: CatalogDb) {
  return {
    state: database.table('portalDevice') as Table<BackupStateRecord, 'backup'>,
    pending: database.table('pendingRestore') as Table<PendingRestoreRecord, string>,
  }
}

/** Ausente = `unknown`: uma TV recém-pareada sempre pergunta ao serviço antes de subir (`logic/backup.md` §1). */
export async function readBackupState(database: CatalogDb): Promise<BackupStateRecord> {
  return (await backupTables(database).state.get('backup')) ?? { id: 'backup', state: 'unknown' }
}

export async function writeBackupState(database: CatalogDb, next: Omit<BackupStateRecord, 'id'>): Promise<void> {
  await backupTables(database).state.put({ ...next, id: 'backup' })
}
