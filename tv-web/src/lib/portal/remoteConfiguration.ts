import type { CatalogDb } from '../catalog/db'
import { createSource, updateSource, deleteSource, sourceDeletionTables,
  type CreateSourceInput, type SourceView, type UpdateSourceInput } from '../catalog/sourceRepository'
import { portalTables } from './portalTables'
import { sourceExtras } from '../catalog/sourceInput'
import { drainRemoteImports, type ImportRemoteSource } from './remoteImportOutbox'

export interface RemoteMutation {
  operationId: string
  deviceId: string
  sourceId: string
  expectedRevision: number
  action: 'create' | 'update' | 'delete'
  input?: CreateSourceInput | UpdateSourceInput
}

export interface RemoteConfigurationOptions {
  deviceId: string
  database: CatalogDb
  importSource: ImportRemoteSource
  activeSourceId?: string
  authority?: { authEpoch: number; recoveryEpoch: string }
  confirmDestructive?: (mutation: RemoteMutation) => Promise<boolean>
}

export interface RemoteMutationResult {
  state: 'applied' | 'conflict' | 'wrong_device'
  sourceId: string
  revision: number
}

export interface PortalSourceView {
  id: string
  type: string
  displayName: string
  connectionState: string
  updatedAt: number
}

const idPattern = /^[A-Za-z0-9_-]{1,128}$/
const inputFields = new Set(['type', 'displayName', 'm3uUrl', 'providerDns', 'providerUsername', 'providerPassword',
  'epgManualUrl', 'epgOffsetHours', 'epgDisabled', 'clearFields'])

function validate(mutation: RemoteMutation) {
  if (![mutation.operationId, mutation.sourceId, mutation.deviceId].every(id => typeof id === 'string' && idPattern.test(id)) ||
      !Number.isSafeInteger(mutation.expectedRevision) || mutation.expectedRevision < 0 ||
      !['create', 'update', 'delete'].includes(mutation.action)) throw new Error('invalid_remote_mutation')
  if (mutation.action === 'delete') {
    if (mutation.input !== undefined) throw new Error('invalid_remote_mutation')
    return
  }
  const input = mutation.input
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_remote_mutation')
  for (const [key, value] of Object.entries(input)) {
    if (!inputFields.has(key)) throw new Error('invalid_remote_mutation')
    if (['epgManualUrl', 'epgOffsetHours', 'epgDisabled', 'clearFields'].includes(key)) continue
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value) ||
        value.length > (key === 'displayName' ? 120 : ['providerUsername', 'providerPassword'].includes(key) ? 1024 : 4096)) {
      throw new Error('invalid_remote_mutation')
    }
  }
  try { sourceExtras(input) } catch { throw new Error('invalid_remote_mutation') }
  for (const field of ['m3uUrl', 'providerDns'] as const) {
    const value = input[field]
    if (value?.trim()) {
      try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error()
      } catch { throw new Error('invalid_remote_mutation') }
    }
  }
  if (mutation.action === 'create') {
    const create = input as CreateSourceInput
    if (!['provider_credentials', 'm3u_url'].includes(create.type) || !create.displayName?.trim()) throw new Error('invalid_remote_mutation')
  } else if ('type' in input) throw new Error('invalid_remote_mutation')
}

async function mutationDigest(mutation: RemoteMutation) {
  const input = mutation.input && Object.fromEntries(Object.entries(mutation.input).sort(([a], [b]) => a.localeCompare(b)))
  const value = JSON.stringify({ operationId: mutation.operationId, deviceId: mutation.deviceId,
    sourceId: mutation.sourceId, expectedRevision: mutation.expectedRevision, action: mutation.action, input })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Aceitação atômica; nenhum download/import dentro do commit Dexie. */
export async function applyRemoteMutation(
  mutation: RemoteMutation,
  options: RemoteConfigurationOptions,
): Promise<RemoteMutationResult> {
  if (mutation.deviceId !== options.deviceId) return { state: 'wrong_device', sourceId: mutation.sourceId, revision: 0 }
  validate(mutation)
  const digest = await mutationDigest(mutation)
  const { database } = options
  const tables = portalTables(database)
  // Confirmação local não segura uma transação aberta. CAS abaixo revalida a revisão.
  const oldReceipt = await tables.operations.get(mutation.operationId)
  const destructive = mutation.action !== 'create' && options.activeSourceId === mutation.sourceId
  const permitted = !destructive || !!oldReceipt || await options.confirmDestructive?.(mutation) === true
  const result = await database.transaction('rw', [...sourceDeletionTables(database), tables.operations, tables.device], async () => {
    if (options.authority) {
      const device = await tables.device.get('device')
      if (!device || device.deviceId !== options.deviceId || device.authEpoch !== options.authority.authEpoch ||
          device.recoveryEpoch !== options.authority.recoveryEpoch) throw new Error('stale_portal_authority')
    }
    const previous = await tables.operations.get(mutation.operationId)
    const current = await tables.revisions.get(mutation.sourceId)
    const revision = current?.revision ?? 0
    if (previous) {
      if (previous.digest === digest) return previous.result
      return { state: 'conflict' as const, sourceId: mutation.sourceId, revision }
    }
    const source = await database.sources.get(mutation.sourceId)
    const conflict = !permitted || current?.tombstone || await tables.deletes.where('sourceId').equals(mutation.sourceId).count() > 0 ||
      revision !== mutation.expectedRevision || (mutation.action === 'create' ? !!source || !!current : mutation.action === 'update' && !source)
    if (conflict) {
      const result = { state: 'conflict' as const, sourceId: mutation.sourceId, revision }
      await tables.operations.put({ operationId: mutation.operationId, sourceId: mutation.sourceId, digest, result, createdAt: Date.now() })
      return result
    }
    if (mutation.action === 'create') {
      await createSource(mutation.input as CreateSourceInput, database, { sourceId: mutation.sourceId })
    } else if (mutation.action === 'update') {
      await updateSource(mutation.sourceId, mutation.input as UpdateSourceInput, database)
    } else {
      await deleteSource(mutation.sourceId, database, { origin: 'portal' })
    }
    const appliedRevision = (await tables.revisions.get(mutation.sourceId))!.revision
    const result = { state: 'applied' as const, sourceId: mutation.sourceId, revision: appliedRevision }
    await tables.operations.put({ operationId: mutation.operationId, sourceId: mutation.sourceId, digest, result, createdAt: Date.now() })
    if (mutation.action !== 'delete') {
      await tables.imports.put({ sourceId: mutation.sourceId, configRevision: appliedRevision,
        operationId: mutation.operationId, state: 'queued' })
    }
    return result
  })
  if (result.state === 'applied' && mutation.action !== 'delete') {
    await drainRemoteImports(database, options.importSource, mutation.sourceId)
  }
  return result
}

/** Projeção explicitamente permitida; SourceView contém URLs e não pode sair da TV. */
export function toPortalSourceView(source: SourceView): PortalSourceView {
  return { id: source.id, type: source.type, displayName: source.displayName,
    connectionState: source.connectionState, updatedAt: source.updatedAt }
}
