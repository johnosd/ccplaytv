import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb, type UserStateRecord } from '../catalog/db'
import { buildUsageBackup, MAX_BACKUP_BYTES } from './usageBackup'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

// research §3: acima do teto, corta histórico antigo; favoritos e progresso nunca saem.
it('backup grande corta só o histórico mais antigo e cabe no teto', async () => {
  const db = new CatalogDb('test-072-trim-' + crypto.randomUUID())
  databases.push(db)
  const filler = 'x'.repeat(120)
  const history: UserStateRecord[] = Array.from({ length: 4000 }, (_, index) => ({
    stableId: `lista:movie:${index}-${filler}`, sourceId: 'lista', isFavorite: false, lastWatched: index, createdAt: index, updatedAt: index }))
  await db.userStates.bulkPut([...history,
    { stableId: 'lista:movie:favorito', sourceId: 'lista', isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 },
    { stableId: 'lista:movie:andamento', sourceId: 'lista', isFavorite: false, progressSeconds: 30, lastWatched: 0, createdAt: 0, updatedAt: 0 }])

  const payload = await buildUsageBackup(db, { now: 1, settings: {} })

  expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThanOrEqual(MAX_BACKUP_BYTES)
  const ids = new Set(payload.usage.userStates.map((row) => row.stableId))
  expect(ids.has('lista:movie:favorito') && ids.has('lista:movie:andamento')).toBe(true)
  expect(payload.counts.history).toBeLessThan(4001)
  // O que ficou é o mais recente.
  expect(ids.has(`lista:movie:3999-${filler}`)).toBe(true)
  expect(ids.has(`lista:movie:0-${filler}`)).toBe(false)
})
