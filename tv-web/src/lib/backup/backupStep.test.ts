import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalRequestError } from '../portal/portalClient'
import { readBackupState, writeBackupState } from './backupState'
import { runBackupStep } from './backupStep'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
const counts = { favorites: 1, history: 0, progress: 0, categoryPreferences: 0, listPins: 0 }

function setup(handler: (path: string, options: { method?: string; body?: Record<string, unknown> }) => unknown) {
  const db = new CatalogDb('test-072-step-' + crypto.randomUUID())
  databases.push(db)
  const request = vi.fn(async (path: string, options: { method?: string; body?: Record<string, unknown> }) => handler(path, options))
  const connection = { database: db, ready: async () => ({ bearer: 'tv.bearer' }), client: { request } }
  return { db, request, connection: connection as never }
}

it('TV recém-pareada com backup no serviço oferece a restauração e não sobe nada', async () => {
  const { db, request, connection } = setup((path) => (path.endsWith('/summary') ? { exists: true, createdAt: 50, counts } : undefined))
  expect(await runBackupStep(db, connection, { now: 100, settings: {} })).toBe('offer')
  expect(request.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false)
  expect(await readBackupState(db)).toMatchObject({ state: 'offered', offer: { createdAt: 50 } })
})

it('sem backup no serviço sobe e guarda o instante; depois sobe direto, esperando que ele exista', async () => {
  const puts: Record<string, unknown>[] = []
  const { db, connection } = setup((path, options) => {
    if (path.endsWith('/summary')) return { exists: false }
    puts.push(options.body!)
    return { createdAt: 100 + puts.length, counts: { ...counts, favorites: 0 } }
  })
  expect(await runBackupStep(db, connection, { now: 100, settings: {} })).toBe('upload')
  expect(puts[0]).toMatchObject({ format: 1, expectExisting: false })
  expect(await runBackupStep(db, connection, { now: 200, settings: {} })).toBe('upload')
  expect(puts[1]).toMatchObject({ expectExisting: true })
  expect((await readBackupState(db)).lastBackupAt).toBe(102)
})

it('backup apagado pela pessoa (not_found) desliga o envio até nova ação', async () => {
  const { db, request, connection } = setup((_path, options) => {
    if (options.method === 'PUT') throw new PortalRequestError('not_found')
    return undefined
  })
  await writeBackupState(db, { state: 'settled', lastBackupAt: 10 })
  expect(await runBackupStep(db, connection, { now: 100, settings: {} })).toBe('skip')
  expect((await readBackupState(db)).state).toBe('disabled')
  request.mockClear()
  expect(await runBackupStep(db, connection, { now: 200, settings: {} })).toBe('skip')
  expect(request).not.toHaveBeenCalled()
})
