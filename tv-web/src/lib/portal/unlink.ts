/** Feature 072: solta só o pareamento local e guarda o código de recuperação para a reassociação (`logic/desvincular.md`). */
import type { Table } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import { backupTables } from '../backup/backupState'
import { portalTables } from './portalTables'

/** Guardado em `portalDevice` (id `relink`): é o mesmo segredo que já estava na TV; consumido na reassociação. */
export interface RelinkHintRecord {
  id: 'relink'
  deviceId: string
  displayId?: string
  recoveryCode: string
  recoveryCodeVersion: number
  savedAt: number
}

function relinkTable(database: CatalogDb) {
  return database.table('portalDevice') as Table<RelinkHintRecord, 'relink'>
}

/**
 * Apaga identidade, emissão pendente, licença em cache e fila de envios; marca o backup como `unknown`.
 * Preserva catálogo, dados de uso, chave TMDB, PINs, teste local e a fila de exclusões (plan D-003). Uma transação só.
 */
export async function unlinkPortal(database: CatalogDb, now = Date.now()): Promise<void> {
  const tables = portalTables(database)
  const backup = backupTables(database)
  await database.transaction('rw', tables.device, tables.license, tables.uploads, async () => {
    const device = await tables.device.get('device')
    if (device) {
      await relinkTable(database).put({ id: 'relink', deviceId: device.deviceId,
        ...(device.displayId ? { displayId: device.displayId } : {}),
        recoveryCode: device.recoveryCode, recoveryCodeVersion: device.recoveryCodeVersion, savedAt: now })
    }
    await tables.device.delete('device')
    await tables.bootstrap.delete('bootstrap')
    await tables.license.delete('entitlement')
    await tables.uploads.clear()
    const previous = await backup.state.get('backup')
    await backup.state.put({ id: 'backup', state: 'unknown',
      ...(previous?.lastBackupAt ? { lastBackupAt: previous.lastBackupAt } : {}) })
  })
}

export async function readRelinkHint(database: CatalogDb): Promise<RelinkHintRecord | undefined> {
  return relinkTable(database).get('relink')
}

export async function clearRelinkHint(database: CatalogDb): Promise<void> {
  await relinkTable(database).delete('relink')
}
