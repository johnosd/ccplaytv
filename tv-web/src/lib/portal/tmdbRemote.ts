/**
 * Aplicação, na TV, da chave TMDB enviada pelo portal (feature 077, US4, ADR-020, constitution 1.15.0 (j)): roda no
 * passo `integrations` do Atualizar de listas. A chave só existe dentro desta função e de `saveKey`; nunca em ack, log
 * ou erro. O ack carrega só o id da operação e `applied|rejected|retry` com um motivo de lista fechada.
 */
import type { CatalogDb } from '../catalog/db'
import { removeTmdbKey, saveTmdbKey } from '../metadata/tmdbKeyRepository'
import type { SaveTmdbKeyResult } from '../metadata/types'
import { PortalRequestError } from './portalClient'
import type { PortalConnection } from './portalConnection'
import { portalTables } from './portalTables'

export interface RemoteTmdbInstruction { operationId: string; action: 'set' | 'remove'; key?: string }
export type RemoteTmdbAck = { state: 'applied' } | { state: 'rejected'; reason: 'refused' | 'invalid_format' } | { state: 'retry'; reason: 'offline' | 'rate_limited' }
export type RemoteTmdbOutcome = 'none' | 'applied' | 'rejected' | 'retry'

export interface RemoteTmdbPorts {
  /** `GET /device/integrations/tmdb`; `null` = nada pendente. */
  fetchInstruction(signal: AbortSignal): Promise<RemoteTmdbInstruction | null>
  /** `POST /device/integrations/tmdb/ack`: só o id da operação e o resultado, nunca a chave. */
  ack(operationId: string, ack: RemoteTmdbAck, signal: AbortSignal): Promise<void>
  /** `saveTmdbKey` da TV (testa no TMDB e guarda). */
  saveKey(key: string): Promise<SaveTmdbKeyResult>
  removeKey(): Promise<void>
}

/**
 * Busca a operação pendente e a aplica. `saveTmdbKey` já valida o formato, testa a chave no TMDB e só então grava:
 * recusa não troca nada. Falha inesperada não confirma como aplicada e não carrega a chave no erro.
 */
export async function applyRemoteTmdb(ports: RemoteTmdbPorts, signal: AbortSignal): Promise<RemoteTmdbOutcome> {
  const instruction = await ports.fetchInstruction(signal)
  if (!instruction) return 'none'
  const { operationId } = instruction
  if (instruction.action === 'remove') {
    await ports.removeKey()
    await ports.ack(operationId, { state: 'applied' }, signal)
    return 'applied'
  }
  // `set` sem chave é pedido malformado: recusa sem tocar na chave guardada.
  const result: SaveTmdbKeyResult = instruction.key
    ? await ports.saveKey(instruction.key).catch((): never => { throw new Error('tmdb_apply_failed') })
    : { ok: false, reason: 'invalid_format' }
  if (result.ok) {
    await ports.ack(operationId, { state: 'applied' }, signal)
    return 'applied'
  }
  if (result.reason === 'offline' || result.reason === 'rate_limited') {
    await ports.ack(operationId, { state: 'retry', reason: result.reason }, signal)
    return 'retry'
  }
  await ports.ack(operationId, { state: 'rejected', reason: result.reason }, signal)
  return 'rejected'
}

const OPERATION_ID = /^[A-Za-z0-9_-]{1,128}$/
const KEY_SHAPE = /^[A-Za-z0-9._-]{16,600}$/

/** Valida a resposta do serviço antes de qualquer efeito; a chave só passa se tiver o formato genérico do contrato. */
function parseInstruction(value: unknown): RemoteTmdbInstruction | null {
  const operation = (value as { operation?: unknown } | null)?.operation
  if (operation === null) return null
  const row = operation as Partial<RemoteTmdbInstruction> | undefined
  if (!row || typeof row.operationId !== 'string' || !OPERATION_ID.test(row.operationId) ||
      (row.action !== 'set' && row.action !== 'remove')) throw new PortalRequestError('service_unavailable')
  if (row.action === 'set' && (typeof row.key !== 'string' || !KEY_SHAPE.test(row.key))) throw new PortalRequestError('service_unavailable')
  if (row.action === 'remove' && row.key !== undefined) throw new PortalRequestError('service_unavailable')
  return row.action === 'set' ? { operationId: row.operationId, action: 'set', key: row.key } : { operationId: row.operationId, action: 'remove' }
}

/**
 * Porta de produção do passo `integrations`: fala com o serviço pelo bearer da própria TV e aplica pelo caminho normal
 * (`saveTmdbKey`/`removeTmdbKey`). Antes de cada efeito confere que a identidade da TV não mudou durante o passo.
 */
export function createTmdbRemoteStep(database: CatalogDb, connection: PortalConnection) {
  const tables = portalTables(database)
  return async (signal: AbortSignal): Promise<RemoteTmdbOutcome> => {
    const saved = await connection.ready()
    async function same() {
      signal.throwIfAborted()
      const current = await tables.device.get('device')
      if (!current || current.deviceId !== saved.deviceId || current.authEpoch !== saved.authEpoch ||
          current.recoveryEpoch !== saved.recoveryEpoch) throw new PortalRequestError('unauthorized')
    }
    return applyRemoteTmdb({
      async fetchInstruction(abort) {
        await same()
        const response = await connection.client.request<unknown>('/portal/v1/device/integrations/tmdb',
          { method: 'GET', bearer: saved.bearer, signal: abort })
        await same()
        return parseInstruction(response)
      },
      async ack(operationId, ack, abort) {
        await same()
        await connection.client.request('/portal/v1/device/integrations/tmdb/ack',
          { bearer: saved.bearer, body: { operationId, ...ack }, signal: abort })
      },
      saveKey: key => saveTmdbKey(key, { database, signal }),
      removeKey: () => removeTmdbKey({ database }),
    }, signal)
  }
}
