import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { markSubtitleKeyState, saveSubtitleKey, setSubtitleKeyChosen } from '../subtitles/subtitleCredentials'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from './deviceIdentity'
import { PortalRequestError } from './portalClient'
import { PortalConnection } from './portalConnection'
import { createPortalSync } from './portalSync'
import { capturePortalSnapshot } from './snapshotPublisher'

// Feature 091 (ADR-022, D-006/D-007): `integrations.subtitles` do snapshot — só o estado, nunca valor/máscara — e o recuo
// para um serviço anterior à 091, que recusa o campo novo.
const KEY = 'chave-subdl-ficticia-091-snap'
const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

async function newDb() {
  const db = new CatalogDb('test-091-snap-' + crypto.randomUUID()); databases.push(db)
  const credentials = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A', deviceKey: 'b'.repeat(42) + 'A',
    authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await persistCredentialIssuance(db, credentials, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  return db
}
const accept = async () => new Response('{"status":true,"subtitles":[]}', { status: 200 })

it('o snapshot diz, por fornecedor, se há chave e como foi a última tentativa — sem valor nem máscara', async () => {
  const db = await newDb()
  expect((await capturePortalSnapshot(db)).integrations.subtitles).toEqual({ opensubtitles: 'none', subdl: 'none' })
  await saveSubtitleKey('subdl', KEY, { database: db, fetchImpl: accept })
  expect((await capturePortalSnapshot(db)).integrations.subtitles).toEqual({ opensubtitles: 'none', subdl: 'configured' })
  // "Usar o padrão" (chosen=false) não apaga a chave: o portal ainda vê "configured".
  await setSubtitleKeyChosen('subdl', false, { database: db })
  expect((await capturePortalSnapshot(db)).integrations.subtitles.subdl).toBe('configured')
  await markSubtitleKeyState('subdl', 'rejected', { database: db })
  expect((await capturePortalSnapshot(db)).integrations.subtitles.subdl).toBe('rejected')
  await markSubtitleKeyState('subdl', 'rate_limited', { database: db })
  const snapshot = await capturePortalSnapshot(db)
  expect(snapshot.integrations.subtitles.subdl).toBe('rate_limited')
  expect(JSON.stringify(snapshot)).not.toContain(KEY)
  expect(JSON.stringify(snapshot)).not.toContain(KEY.slice(-4))
})

it('serviço anterior à 091 recusa `integrations.subtitles` (422): publica de novo sem ele; outra falha não é mascarada', async () => {
  const db = await newDb()
  const bodies: { integrations: Record<string, unknown> }[] = []
  let reject: 'old-service' | 'down' | undefined = 'old-service'
  const request = vi.fn(async (path: string, options: { body?: unknown }) => {
    if (path.endsWith('/snapshot')) {
      const body = options.body as { integrations: Record<string, unknown> }
      bodies.push(body)
      if (reject === 'old-service' && 'subtitles' in body.integrations) throw new PortalRequestError('invalid_input')
      if (reject === 'down') throw new PortalRequestError('service_unavailable')
    }
    return {}
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  const ports = createPortalSync({ database: db, connection, importSource: async () => {}, committed: async () => {}, confirmDestructive: async () => true, activeSourceId: () => undefined })
  const signal = new AbortController().signal
  await ports.publishSnapshot(signal)
  expect(bodies).toHaveLength(2)
  expect('subtitles' in bodies[0].integrations).toBe(true)
  expect(bodies[1].integrations).toEqual({ tmdb: 'none' })

  bodies.length = 0
  reject = 'down'
  await expect(ports.publishSnapshot(signal)).rejects.toThrow('service_unavailable')
  expect(bodies).toHaveLength(1) // não reenvia por qualquer erro: só pelo 422 do campo novo
})
