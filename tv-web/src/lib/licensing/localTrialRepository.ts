/** Persistência do teste local (071/D-005). Nenhuma rede; nada aqui entra em exportação/backup. */
import type { CatalogDb } from '../catalog/db'
import { portalTables, type LocalTrialRecord } from '../portal/portalTables'
import { reconcileTrialStart } from './localTrial'

/**
 * Cria o registro na primeira abertura do build comercial. `hintStartedAt` é o início herdado de uma licença de
 * teste já verificada no aparelho (instalação em uso): nunca `now`, para não estender quem já está no meio do teste.
 */
export async function ensureLocalTrial(database: CatalogDb, hintStartedAt?: number, now = Date.now()): Promise<LocalTrialRecord> {
  const table = portalTables(database).localTrial
  return database.transaction('rw', table, async () => {
    const current = await table.get('trial')
    if (current) return current
    const hint = hintStartedAt !== undefined && Number.isFinite(hintStartedAt) && hintStartedAt > 0 ? hintStartedAt : now
    const record: LocalTrialRecord = { id: 'trial', startedAt: Math.min(now, hint), highWatermark: now }
    await table.put(record)
    return record
  })
}

/** Sobe a marca d'água; nunca diminui. */
export async function checkpointLocalTrial(database: CatalogDb, highWatermark: number): Promise<void> {
  if (!Number.isFinite(highWatermark) || highWatermark < 0) return
  const table = portalTables(database).localTrial
  await database.transaction('rw', table, async () => {
    const current = await table.get('trial')
    if (!current || current.highWatermark >= highWatermark) return
    await table.put({ ...current, highWatermark })
  })
}

/** Reconcilia com o início devolvido pelo serviço: só encurta (D-006). Cria o registro se ainda não existir. */
export async function anchorLocalTrial(database: CatalogDb, serverStartedAt: number | undefined, now = Date.now()): Promise<LocalTrialRecord> {
  const table = portalTables(database).localTrial
  return database.transaction('rw', table, async () => {
    const current = await table.get('trial') ?? { id: 'trial' as const, startedAt: now, highWatermark: now }
    const startedAt = reconcileTrialStart(current.startedAt, serverStartedAt)
    const anchored = serverStartedAt !== undefined && Number.isSafeInteger(serverStartedAt) && serverStartedAt > 0 ? { anchoredAt: now } : {}
    const next: LocalTrialRecord = { ...current, startedAt, ...anchored }
    await table.put(next)
    return next
  })
}
