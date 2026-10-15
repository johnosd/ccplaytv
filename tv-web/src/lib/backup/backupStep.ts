/**
 * Feature 072: o passo `backup` do Atualizar de listas e do botão "Fazer backup agora" (`logic/backup.md` §2).
 * Só roda por ação da pessoa (ADR-016). Com estado `unknown` pergunta o resumo antes: se houver backup, oferece a
 * restauração e NÃO sobe (subir apagaria o backup que a pessoa ainda não decidiu restaurar).
 */
import type { CatalogDb } from '../catalog/db'
import type { PortalConnection } from '../portal/portalConnection'
import { backupClient } from './backupClient'
import { nextBackupAction } from './backupDecision'
import { readBackupState, writeBackupState } from './backupState'
import { buildUsageBackup } from './usageBackup'
import { readBackupSettings } from './usageSettings'
import { applyPendingRestores } from './usageRestore'
import { PortalRequestError } from '../portal/portalClient'
import type { BackupAction, RemoteBackupSummary } from './usageBackupTypes'

export async function runBackupStep(database: CatalogDb, connection: PortalConnection,
  { signal, now = Date.now(), settings = readBackupSettings() }: { signal?: AbortSignal; now?: number; settings?: Record<string, string> } = {},
): Promise<BackupAction> {
  const client = backupClient(connection)
  // Listas que voltaram neste Atualizar recebem os dados restaurados que esperavam por elas (local, sem rede).
  await applyPendingRestores(database, now)
  const current = await readBackupState(database)
  let remote: RemoteBackupSummary | undefined
  if (current.state === 'unknown') {
    try { remote = await client.summary(signal) } catch (error) {
      if (signal?.aborted) throw error
      remote = 'unavailable'
    }
  }
  const action = nextBackupAction({ state: current.state, remote })
  if (action === 'offer' && remote && remote !== 'unavailable' && remote.exists) {
    await writeBackupState(database, { state: 'offered', lastBackupAt: remote.createdAt,
      offer: { createdAt: remote.createdAt, counts: remote.counts } })
  } else if (action === 'upload') {
    try {
      const saved = await client.put(await buildUsageBackup(database, { now, settings }), current.lastBackupAt !== undefined, signal)
      await writeBackupState(database, { state: 'settled', lastBackupAt: saved.createdAt })
    } catch (error) {
      // A pessoa apagou o backup (TV ou site): desliga até ela pedir de novo (SC-006).
      if (!(error instanceof PortalRequestError) || error.code !== 'not_found') throw error
      await writeBackupState(database, { state: 'disabled' })
      return 'skip'
    }
  }
  return action
}
