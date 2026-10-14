/** Adaptador HTTP: exclusões duráveis antes de comandos; snapshot somente allowlist. */
import type { CatalogDb } from '../catalog/db'
import { PortalRequestError } from './portalClient'
import type { PortalConnection } from './portalConnection'
import type { PortalAgentPorts } from './portalAgent'
import { portalTables, type PortalDeviceRecord } from './portalTables'
import { applyRemoteMutation, type RemoteMutation } from './remoteConfiguration'
import { drainRemoteImports, type ImportRemoteSource } from './remoteImportOutbox'
import { capturePortalSnapshot } from './snapshotPublisher'
import { flushSourceUploads, markSourceUploaded } from './sourceUploads'

interface Delivery extends Omit<RemoteMutation, 'action'> {
  action: 'source.create' | 'source.update' | 'source.delete'
  authEpoch: number
  expiresAt: string | null
}
export interface PortalSyncOptions {
  database: CatalogDb
  connection: PortalConnection
  importSource: ImportRemoteSource
  activeSourceId(): string | undefined
  confirmDestructive(mutation: RemoteMutation, signal: AbortSignal): Promise<boolean>
  committed(mutation: RemoteMutation): Promise<void>
}
const id = /^[A-Za-z0-9_-]{1,128}$/
function parseDelivery(value: unknown, device: PortalDeviceRecord): Delivery {
  if (!value || typeof value !== 'object') throw new PortalRequestError('service_unavailable')
  const row = value as Delivery
  if (![row.operationId, row.sourceId, row.deviceId].every(x => typeof x === 'string' && id.test(x)) ||
      row.deviceId !== device.deviceId || row.authEpoch !== device.authEpoch ||
      !Number.isSafeInteger(row.expectedRevision) || row.expectedRevision < 0 ||
      !['source.create', 'source.update', 'source.delete'].includes(row.action)) throw new PortalRequestError('service_unavailable')
  if (row.action !== 'source.delete' && (typeof row.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= Date.now())) throw new PortalRequestError('conflict')
  if (row.action === 'source.delete' && row.input !== undefined) throw new PortalRequestError('service_unavailable')
  return row
}
export function createPortalSync(options: PortalSyncOptions): PortalAgentPorts {
  const { database, connection } = options
  const tables = portalTables(database)
  async function device() { return connection.ready() }
  async function same(expected: PortalDeviceRecord, signal: AbortSignal) {
    signal.throwIfAborted()
    const current = await tables.device.get('device')
    if (!current || current.deviceId !== expected.deviceId || current.authEpoch !== expected.authEpoch ||
        current.recoveryEpoch !== expected.recoveryEpoch) throw new PortalRequestError('unauthorized')
  }
  async function ack(saved: PortalDeviceRecord, operationId: string, body: unknown, signal: AbortSignal) {
    await same(saved, signal)
    await connection.client.request('/portal/v1/device/operations/' + operationId + '/ack',
      { bearer: saved.bearer, body, signal })
  }
  return {
    async flushDeletions(signal) {
      const saved = await device()
      await same(saved, signal)
      // Uma página por ciclo: falha ou excedente impede pull, preservando prioridade.
      const pending = await tables.deletes.filter(row => row.serverAckAt === undefined).limit(20).toArray()
      if (!pending.length) return
      const result = await connection.client.request<{ acks: string[] }>('/portal/v1/device/deletions', {
        bearer: saved.bearer, signal, body: { deletions: pending.map(row => ({ deletionId: row.deletionId,
          sourceId: row.sourceId, revision: row.revision, createdAt: new Date(row.createdAt).toISOString() })) },
      })
      await same(saved, signal)
      if (!Array.isArray(result.acks) || result.acks.some(value => !pending.some(row => row.deletionId === value))) throw new PortalRequestError('service_unavailable')
      await database.transaction('rw', tables.deletes, async () => {
        for (const deletionId of result.acks) {
          const current = await tables.deletes.get(deletionId)
          const sent = pending.find(row => row.deletionId === deletionId)!
          if (current?.sourceId === sent.sourceId && current.revision === sent.revision) await tables.deletes.delete(deletionId)
        }
      })
      if (await tables.deletes.filter(row => row.serverAckAt === undefined).count()) throw new PortalRequestError('service_unavailable')
    },
    /** 071/FR-008: envia as listas da TV (fila durável por revisão) ao serviço; para no primeiro erro. */
    async flushUploads(signal) {
      const saved = await device()
      await same(saved, signal)
      await flushSourceUploads(database, connection, saved, signal, () => same(saved, signal))
    },
    async pull(signal) {
      const saved = await device()
      await same(saved, signal)
      await drainRemoteImports(database, options.importSource)
      const response = await connection.client.request<{ operations: unknown[] }>('/portal/v1/device/operations',
        { method: 'GET', bearer: saved.bearer, signal })
      await same(saved, signal)
      if (!Array.isArray(response.operations) || response.operations.length > 25) throw new PortalRequestError('service_unavailable')
      // Validar todo o lote antes de efeitos. A ordem do servidor não pode tirar prioridade de delete.
      const rows = response.operations.map(row => parseDelivery(row, saved)).sort((a, b) =>
        Number(b.action === 'source.delete') - Number(a.action === 'source.delete'))
      for (const row of rows) {
        await same(saved, signal)
        const mutation: RemoteMutation = { operationId: row.operationId, deviceId: row.deviceId,
          sourceId: row.sourceId, expectedRevision: row.expectedRevision,
          action: row.action === 'source.create' ? 'create' : row.action === 'source.update' ? 'update' : 'delete',
          ...(row.input === undefined ? {} : { input: row.input }) }
        const revision = await tables.revisions.get(row.sourceId)
        if (mutation.action === 'delete' && revision?.tombstone && revision.revision >= row.expectedRevision &&
            !await database.sources.get(row.sourceId)) {
          await ack(saved, row.operationId, { state: 'applied', revision: revision.revision }, signal)
          continue
        }
        const oldReceipt = await tables.operations.get(row.operationId)
        const destructive = mutation.action !== 'create' && options.activeSourceId() === mutation.sourceId
        if (destructive && !oldReceipt) {
          const revision = (await tables.revisions.get(mutation.sourceId))?.revision ?? 0
          await ack(saved, row.operationId, { state: 'awaiting_confirmation', revision }, signal)
          if (!await options.confirmDestructive(mutation, signal)) continue
          await same(saved, signal)
        }
        const result = await applyRemoteMutation(mutation, { deviceId: saved.deviceId, database,
          importSource: options.importSource, authority: { authEpoch: saved.authEpoch, recoveryEpoch: saved.recoveryEpoch } })
        if (result.state === 'wrong_device') throw new PortalRequestError('unauthorized')
        if (result.state === 'applied') await options.committed(mutation)
        // O valor veio do portal e já está no serviço nesta revisão: não precisa subir de novo (071/D-010).
        if (result.state === 'applied' && mutation.action !== 'delete') await markSourceUploaded(database, mutation.sourceId, result.revision)
        const pendingImport = await tables.imports.get(row.sourceId)
        await ack(saved, row.operationId, { state: result.state, revision: result.revision,
          ...(result.state === 'applied' && mutation.action !== 'delete' && pendingImport?.operationId === row.operationId
            ? { importState: pendingImport.state } : {}) }, signal)
      }
    },
    async publishSnapshot(signal) {
      const saved = await device()
      const snapshot = await capturePortalSnapshot(database)
      await same(saved, signal)
      await connection.client.request('/portal/v1/device/snapshot', { method: 'PUT', bearer: saved.bearer,
        body: snapshot, signal })
      // Importação pode terminar depois do ACK inicial; confirmação posterior não reaplica comandos.
      const imports = await tables.imports.where('state').anyOf('completed', 'error').filter(row => row.acknowledgedState !== row.state).limit(5).toArray()
      for (const item of imports) {
        const receipt = await tables.operations.get(item.operationId)
        if (receipt?.result.state !== 'applied') continue
        await ack(saved, item.operationId, { state: 'applied', revision: receipt.result.revision,
          importState: item.state }, signal)
        await database.transaction('rw', tables.imports, async () => {
          const current = await tables.imports.get(item.sourceId)
          if (current?.operationId === item.operationId && current.state === item.state) {
            await tables.imports.put({ ...current, acknowledgedState: item.state as 'completed' | 'error' })
          }
        })
      }
    },
  }
}
