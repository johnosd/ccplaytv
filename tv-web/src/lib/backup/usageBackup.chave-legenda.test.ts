import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { saveSubtitleKey } from '../subtitles/subtitleCredentials'
import { buildUsageBackup } from './usageBackup'

// Feature 091, SC-002 / FR-009: o backup de uso (072) NÃO passa a conter a chave de legenda pessoal, venha ela da TV ou do portal.
const KEYS = { opensubtitles: 'chave-opensubtitles-ficticia-091-backup', subdl: 'chave-subdl-ficticia-091-backup' } as const
const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

it('SC-002/FR-009: com chaves de legenda guardadas, o backup montado não leva a chave, o final dela nem a tabela', async () => {
  const db = new CatalogDb('test-091-backup-' + crypto.randomUUID())
  databases.push(db)
  const accept = async () => new Response('{"status":true,"subtitles":[],"data":[]}', { status: 200 })
  await saveSubtitleKey('opensubtitles', KEYS.opensubtitles, { database: db, fetchImpl: accept })
  await saveSubtitleKey('subdl', KEYS.subdl, { database: db, fetchImpl: accept })
  // Precondição: as chaves estão mesmo guardadas e escolhidas (senão o teste não provaria nada).
  const stored = await db.table('subtitleCredentials').toArray()
  expect(stored.map((row) => row.provider).sort()).toEqual(['opensubtitles', 'subdl'])
  await db.userStates.put({ stableId: 'lista:movie:a', sourceId: 'lista', isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 })

  const payload = await buildUsageBackup(db, { now: 1, settings: {} })
  const serialized = JSON.stringify(payload)

  expect(payload.counts.favorites).toBe(1)
  for (const key of Object.values(KEYS)) {
    expect(serialized).not.toContain(key)
    expect(serialized).not.toContain(key.slice(-4))
  }
  expect(serialized).not.toMatch(/subtitleCredentials|maskedKey/i)
})
