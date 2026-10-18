import type { CatalogDb } from './db'
import { categoryStoredBytes } from './storageLedger'
import { PIN_WINDOW_MS, type ReleaseCandidate, type ReleaseScope } from './storageBudget'

export async function releaseCandidates(database: CatalogDb, activeSourceId?: string, protectCategoryId?: number, now = Date.now()): Promise<ReleaseCandidate[]> {
  const result: ReleaseCandidate[] = []
  const categories = await database.categories.toArray()
  categories.sort((a, b) => (a.sourceId === activeSourceId ? 1 : 0) - (b.sourceId === activeSourceId ? 1 : 0))
  for (const category of categories) {
    if (category.fetchMode !== 'on_demand' || category.id === protectCategoryId) continue
    const scope: ReleaseScope = category.sourceId === activeSourceId ? 'active-category' : 'inactive-list'
    result.push({ key: `category:${category.id}`, scope, sourceId: category.sourceId, categoryId: category.id as number, bytes: await categoryStoredBytes(database, category.id as number), lastUsedAt: category.lastUsedAt ?? 0, refetchable: true, pinned: category.lastUsedAt !== undefined && now - category.lastUsedAt < PIN_WINDOW_MS })
  }
  return result
}
