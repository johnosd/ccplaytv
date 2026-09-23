import { db, type CatalogDb, type UserStateRecord } from './db'

export function buildStableId(sourceId: string, type: string, originalName: string): string {
  // Replace spaces and special chars to make a clean stable ID, or just concatenate
  return `${sourceId}_${type}_${originalName.trim().toLowerCase()}`
}

export async function getUserState(
  stableId: string,
  database: CatalogDb = db,
): Promise<UserStateRecord | undefined> {
  return database.userStates.get(stableId)
}

export async function toggleFavorite(
  stableId: string,
  sourceId: string,
  isFavorite: boolean,
  database: CatalogDb = db,
): Promise<void> {
  const existing = await database.userStates.get(stableId)
  const now = Date.now()
  if (existing) {
    await database.userStates.update(stableId, {
      isFavorite,
      updatedAt: now,
    })
  } else {
    await database.userStates.add({
      stableId,
      sourceId,
      isFavorite,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export async function updateProgress(
  stableId: string,
  sourceId: string,
  progressSeconds: number,
  database: CatalogDb = db,
): Promise<void> {
  const existing = await database.userStates.get(stableId)
  const now = Date.now()
  if (existing) {
    await database.userStates.update(stableId, {
      progressSeconds,
      lastWatched: now,
      updatedAt: now,
    })
  } else {
    await database.userStates.add({
      stableId,
      sourceId,
      isFavorite: false,
      progressSeconds,
      lastWatched: now,
      createdAt: now,
      updatedAt: now,
    })
  }
}
