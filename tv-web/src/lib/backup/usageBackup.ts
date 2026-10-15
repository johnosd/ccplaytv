/** Feature 072: monta o backup dos dados de uso a partir do aparelho — nunca catálogo, URL ou credencial de lista. */
import type { CatalogDb, UserStateRecord } from '../catalog/db'
import { categoryPreferences, parentalPins } from '../catalog/parentalTables'
import { pickBackupSettings } from './usageSettings'
import type { UsageBackupCounts, UsageBackupPayload } from './usageBackupTypes'

/** Teto do serviço (research §3): o envelope cifrado precisa caber em 1 MiB do Firestore. */
export const MAX_BACKUP_BYTES = 512 * 1024

const isHistory = (row: UserStateRecord) => row.lastWatched !== undefined && !(row.historyHiddenAt !== undefined && row.historyHiddenAt >= row.lastWatched)
const isProgress = (row: UserStateRecord) => (row.progressSeconds ?? 0) > 0 && row.completedAt === undefined

function countOf(payload: Omit<UsageBackupPayload, 'counts'>): UsageBackupCounts {
  const states = payload.usage.userStates
  return {
    favorites: states.filter((row) => row.isFavorite).length,
    history: states.filter(isHistory).length,
    progress: states.filter(isProgress).length,
    categoryPreferences: payload.usage.categoryPreferences.length,
    listPins: payload.usage.listPins.length,
  }
}

const sizeOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

export async function buildUsageBackup(database: CatalogDb, options: { now: number; settings: Record<string, string> }): Promise<UsageBackupPayload> {
  const [userStates, preferences, pins, tmdb] = await Promise.all([
    database.userStates.toArray(), categoryPreferences(database).toArray(), parentalPins(database).toArray(),
    database.integrations.get('tmdb'),
  ])
  const base: Omit<UsageBackupPayload, 'counts'> = {
    format: 1,
    createdAt: options.now,
    usage: { userStates, categoryPreferences: preferences, listPins: pins, settings: pickBackupSettings(options.settings) },
    secrets: tmdb?.key ? { tmdb: { key: tmdb.key, format: tmdb.format } } : {},
  }
  let payload: UsageBackupPayload = { ...base, counts: countOf(base) }
  if (sizeOf(payload) > MAX_BACKUP_BYTES) payload = trim(payload)
  return payload
}

/** Corta histórico antigo sem favorito e sem progresso, do mais antigo ao mais novo, até caber (research §3). */
function trim(payload: UsageBackupPayload): UsageBackupPayload {
  const keep = payload.usage.userStates.filter((row) => row.isFavorite || isProgress(row))
  const droppable = payload.usage.userStates
    .filter((row) => !row.isFavorite && !isProgress(row))
    .sort((a, b) => (b.lastWatched ?? b.updatedAt) - (a.lastWatched ?? a.updatedAt))
  let low = 0
  let high = droppable.length
  // Busca binária pelo maior prefixo (mais recentes) que cabe.
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = { ...payload, usage: { ...payload.usage, userStates: [...keep, ...droppable.slice(0, middle)] } }
    if (sizeOf(candidate) <= MAX_BACKUP_BYTES) low = middle
    else high = middle - 1
  }
  const base = { ...payload, usage: { ...payload.usage, userStates: [...keep, ...droppable.slice(0, low)] } }
  return { ...base, counts: countOf(base) }
}
