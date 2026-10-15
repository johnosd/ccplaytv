/** Feature 072: planeja a restauração — união, o mais recente vence, lista ausente vira pendente por 5 dias (`logic/backup.md` §3). */
import type { UserStateRecord } from '../catalog/db'
import type { CategoryPreferenceRecord, ParentalListPinRecord } from '../catalog/parentalTables'
import type { PendingRestoreRecord, UsageBackupPayload } from './usageBackupTypes'

export const PENDING_RESTORE_TTL_MS = 5 * 86_400_000

export interface RestorePlan {
  /** Só o que precisa ser gravado (o que o backup tem de mais novo para listas presentes). */
  apply: { userStates: UserStateRecord[]; categoryPreferences: CategoryPreferenceRecord[]; listPins: ParentalListPinRecord[] }
  pending: PendingRestoreRecord[]
}

const preferenceKey = (row: CategoryPreferenceRecord) => `${row.sourceId}\u0000${row.kind}\u0000${row.matchKey}`
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** O backup volta do serviço; ainda assim só entra registro com identidade e instante válidos. */
const validState = (row: UserStateRecord) => isText(row?.stableId) && isText(row.sourceId) && isTime(row.updatedAt)
const validPreference = (row: CategoryPreferenceRecord) => isText(row?.sourceId) && isText(row.matchKey) && isTime(row.updatedAt)
const validPin = (row: ParentalListPinRecord) => isText(row?.sourceId) && isText(row.salt) && isText(row.hash) && isTime(row.createdAt)

export function planRestore({ backup, local, existingSourceIds, now }: {
  backup: UsageBackupPayload['usage']
  local: { userStates: UserStateRecord[]; categoryPreferences: CategoryPreferenceRecord[]; listPins: ParentalListPinRecord[] }
  existingSourceIds: readonly string[]
  now: number
}): RestorePlan {
  const present = new Set(existingSourceIds)
  const localStates = new Map(local.userStates.map((row) => [row.stableId, row]))
  const localPreferences = new Map(local.categoryPreferences.map((row) => [preferenceKey(row), row]))
  const localPins = new Map(local.listPins.map((row) => [row.sourceId, row]))
  const plan: RestorePlan = { apply: { userStates: [], categoryPreferences: [], listPins: [] }, pending: [] }
  const pending = new Map<string, PendingRestoreRecord>()
  const pendingFor = (sourceId: string) => {
    let row = pending.get(sourceId)
    if (!row) {
      row = { sourceId, expiresAt: now + PENDING_RESTORE_TTL_MS, userStates: [], categoryPreferences: [] }
      pending.set(sourceId, row)
    }
    return row
  }

  for (const row of (backup.userStates ?? []).filter(validState)) {
    if (!present.has(row.sourceId)) { pendingFor(row.sourceId).userStates.push(row); continue }
    const mine = localStates.get(row.stableId)
    if (!mine || row.updatedAt > mine.updatedAt) plan.apply.userStates.push(row)
  }
  for (const row of (backup.categoryPreferences ?? []).filter(validPreference)) {
    if (!present.has(row.sourceId)) { pendingFor(row.sourceId).categoryPreferences.push(row); continue }
    const mine = localPreferences.get(preferenceKey(row))
    if (!mine || row.updatedAt > mine.updatedAt) plan.apply.categoryPreferences.push(row)
  }
  for (const row of (backup.listPins ?? []).filter(validPin)) {
    if (!present.has(row.sourceId)) { pendingFor(row.sourceId).listPin = row; continue }
    const mine = localPins.get(row.sourceId)
    if (!mine || row.createdAt > mine.createdAt) plan.apply.listPins.push(row)
  }
  plan.pending = [...pending.values()]
  return plan
}
