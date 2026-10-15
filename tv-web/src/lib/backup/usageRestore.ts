/** Feature 072: aplica a restauração e as pendências de listas ausentes (`logic/backup.md` §3). */
import type { CatalogDb } from '../catalog/db'
import { categoryPreferences, parentalPins } from '../catalog/parentalTables'
import type { PortalConnection } from '../portal/portalConnection'
import { backupClient } from './backupClient'
import { backupTables, readBackupState, writeBackupState } from './backupState'
import { planRestore } from './usageMerge'
import { writeBackupSettings } from './usageSettings'
import type { PendingRestoreRecord, UsageBackupPayload } from './usageBackupTypes'

async function localUsage(database: CatalogDb) {
  const [userStates, preferences, listPins, sources] = await Promise.all([
    database.userStates.toArray(), categoryPreferences(database).toArray(), parentalPins(database).toArray(),
    database.sources.toCollection().primaryKeys(),
  ])
  return { local: { userStates, categoryPreferences: preferences, listPins }, sourceIds: sources as string[] }
}

function tablesOf(database: CatalogDb) {
  return [database.userStates, categoryPreferences(database), parentalPins(database), backupTables(database).pending,
    database.integrations]
}

/** Grava o plano numa transação; a chave TMDB do backup só entra se a TV não tiver chave (A002), sem testar na TMDB. */
export async function restoreUsageBackup(database: CatalogDb, payload: UsageBackupPayload, now = Date.now()) {
  const { local, sourceIds } = await localUsage(database)
  const plan = planRestore({ backup: payload.usage, local, existingSourceIds: sourceIds, now })
  await database.transaction('rw', tablesOf(database), async () => {
    if (plan.apply.userStates.length) await database.userStates.bulkPut(plan.apply.userStates)
    if (plan.apply.categoryPreferences.length) await categoryPreferences(database).bulkPut(plan.apply.categoryPreferences)
    if (plan.apply.listPins.length) await parentalPins(database).bulkPut(plan.apply.listPins)
    if (plan.pending.length) await backupTables(database).pending.bulkPut(plan.pending)
    const tmdb = payload.secrets?.tmdb
    if (tmdb?.key && !(await database.integrations.get('tmdb'))) {
      await database.integrations.put({ id: 'tmdb', key: tmdb.key, format: tmdb.format === 'v4' ? 'v4' : 'v3',
        state: 'connected', lastTestedAt: payload.createdAt })
    }
  })
  writeBackupSettings(payload.usage.settings ?? {})
  await writeBackupState(database, { state: 'settled', lastBackupAt: payload.createdAt })
  return { applied: plan.apply.userStates.length + plan.apply.categoryPreferences.length + plan.apply.listPins.length,
    pending: plan.pending.length }
}

/** Botão Restaurar: busca o backup desta TV e aplica. */
export async function restoreFromService(database: CatalogDb, connection: PortalConnection, now = Date.now()) {
  return restoreUsageBackup(database, await backupClient(connection).get(), now)
}

/** Aplica pendências cuja lista voltou e descarta as vencidas. Local, sem rede; chamado no fim do Atualizar. */
export async function applyPendingRestores(database: CatalogDb, now = Date.now()): Promise<number> {
  const table = backupTables(database).pending
  const rows: PendingRestoreRecord[] = await table.toArray()
  if (!rows.length) return 0
  const { local, sourceIds } = await localUsage(database)
  const present = new Set(sourceIds)
  let applied = 0
  await database.transaction('rw', tablesOf(database), async () => {
    for (const row of rows) {
      if (row.expiresAt <= now) { await table.delete(row.sourceId); continue }
      if (!present.has(row.sourceId)) continue
      const plan = planRestore({ backup: { userStates: row.userStates, categoryPreferences: row.categoryPreferences,
        listPins: row.listPin ? [row.listPin] : [], settings: {} }, local, existingSourceIds: [row.sourceId], now })
      if (plan.apply.userStates.length) await database.userStates.bulkPut(plan.apply.userStates)
      if (plan.apply.categoryPreferences.length) await categoryPreferences(database).bulkPut(plan.apply.categoryPreferences)
      if (plan.apply.listPins.length) await parentalPins(database).bulkPut(plan.apply.listPins)
      applied += plan.apply.userStates.length + plan.apply.categoryPreferences.length + plan.apply.listPins.length
      await table.delete(row.sourceId)
    }
  })
  return applied
}

/** Apagar backup (TV): remove no serviço, descarta pendências e desliga o backup automático até nova ação (SC-006). */
export async function deleteUsageBackup(database: CatalogDb, connection: PortalConnection) {
  await backupClient(connection).remove()
  await backupTables(database).pending.clear()
  await writeBackupState(database, { state: 'disabled' })
}

/** "Agora não": a oferta não reaparece sozinha; Restaurar continua em Portal & licença. */
export async function dismissRestoreOffer(database: CatalogDb) {
  const current = await readBackupState(database)
  if (current.state === 'offered' && current.offer) await writeBackupState(database, { ...current, offer: { ...current.offer, dismissed: true } })
}
