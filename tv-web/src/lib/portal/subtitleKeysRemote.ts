/**
 * Aplicação, na TV, das chaves de legenda (OpenSubtitles/SubDL) enviadas pelo portal (feature 091, ADR-022, constitution
 * 1.17.0 exceção (m)): roda no passo `integrations` do Atualizar, ao lado de `tmdbRemote.ts`. A chave só existe dentro
 * destas funções e de `saveSubtitleKey`; nunca em ack, log ou erro. O ack carrega só o fornecedor, o id da operação e
 * `applied|rejected|retry` com um motivo de lista fechada.
 *
 * Desenho em `sdd/specs/091-chave-legenda-portal/logic/chave-legenda-portal.md` §4.
 */
import type { CatalogDb } from '../catalog/db'
import { removeSubtitleKey, saveSubtitleKey, BYOK_PROVIDERS, type SaveSubtitleKeyResult } from '../subtitles/subtitleCredentials'
import type { SubtitleProvider } from '../subtitles/types'
import { PortalRequestError } from './portalClient'
import type { PortalConnection } from './portalConnection'
import { portalTables } from './portalTables'
import { clearSubtitleKeyFeedback, recordSubtitleKeyFeedback } from './subtitleKeyFeedback'

export interface RemoteSubtitleInstruction { provider: SubtitleProvider; operationId: string; action: 'set' | 'remove'; key?: string }
export type RemoteSubtitleAck = { state: 'applied' } | { state: 'rejected'; reason: 'refused' | 'invalid_format' } | { state: 'retry'; reason: 'offline' | 'rate_limited' }
export type RemoteSubtitleOutcome = 'none' | 'applied' | 'rejected' | 'retry'

export interface RemoteSubtitlePorts {
  /** `GET /device/integrations/subtitles`: as operações pendentes (no máximo uma por fornecedor); vazio = nada. */
  fetchInstructions(signal: AbortSignal): Promise<RemoteSubtitleInstruction[]>
  /** `POST /device/integrations/subtitles/ack`: fornecedor, id da operação e resultado — nunca a chave. */
  ack(provider: SubtitleProvider, operationId: string, ack: RemoteSubtitleAck, signal: AbortSignal): Promise<void>
  /** `saveSubtitleKey` da TV (formato, teste no fornecedor, grava com `chosen = true`). */
  saveKey(provider: SubtitleProvider, key: string): Promise<SaveSubtitleKeyResult>
  removeKey(provider: SubtitleProvider): Promise<void>
}

/** Resultado por fornecedor (`none` = nada pendente para ele). */
export type RemoteSubtitleResult = Record<SubtitleProvider, RemoteSubtitleOutcome>

async function applyOne(ports: RemoteSubtitlePorts, instruction: RemoteSubtitleInstruction, signal: AbortSignal): Promise<RemoteSubtitleOutcome> {
  const { provider, operationId } = instruction
  if (instruction.action === 'remove') {
    await ports.removeKey(provider)
    await ports.ack(provider, operationId, { state: 'applied' }, signal)
    return 'applied'
  }
  // `set` sem chave é pedido malformado: recusa sem tocar na chave guardada.
  const result: SaveSubtitleKeyResult = instruction.key ? await ports.saveKey(provider, instruction.key) : { ok: false, reason: 'invalid_format' }
  if (result.ok) {
    await ports.ack(provider, operationId, { state: 'applied' }, signal)
    return 'applied'
  }
  if (result.reason === 'offline' || result.reason === 'rate_limited') {
    await ports.ack(provider, operationId, { state: 'retry', reason: result.reason }, signal)
    return 'retry'
  }
  await ports.ack(provider, operationId, { state: 'rejected', reason: result.reason === 'refused' ? 'refused' : 'invalid_format' }, signal)
  return 'rejected'
}

/**
 * Busca as operações pendentes e aplica uma a uma. `saveKey` já valida o formato, testa a chave no fornecedor e só então
 * grava: recusa não troca nada. Uma falha inesperada num fornecedor não o confirma como aplicado e **não impede o outro**;
 * no fim lança um erro de mensagem fixa (sem a chave nem a causa).
 */
export async function applyRemoteSubtitleKeys(ports: RemoteSubtitlePorts, signal: AbortSignal): Promise<RemoteSubtitleResult> {
  const result: RemoteSubtitleResult = { opensubtitles: 'none', subdl: 'none' }
  const instructions = await ports.fetchInstructions(signal)
  let failed = false
  for (const instruction of instructions) {
    signal.throwIfAborted()
    try {
      result[instruction.provider] = await applyOne(ports, instruction, signal)
    } catch {
      signal.throwIfAborted()
      failed = true
    }
  }
  if (failed) throw new Error('subtitle_apply_failed')
  return result
}

const OPERATION_ID = /^[A-Za-z0-9_-]{1,128}$/
const KEY_SHAPE = /^[A-Za-z0-9._-]{8,200}$/

/** Valida a resposta do serviço antes de qualquer efeito; a chave só passa se tiver o formato genérico do contrato. */
export function parseInstructions(value: unknown): RemoteSubtitleInstruction[] {
  const operations = (value as { operations?: unknown } | null)?.operations
  if (!Array.isArray(operations) || operations.length > BYOK_PROVIDERS.length) throw new PortalRequestError('service_unavailable')
  const parsed: RemoteSubtitleInstruction[] = []
  for (const raw of operations) {
    const row = raw as Partial<RemoteSubtitleInstruction> | null
    if (!row || typeof row.operationId !== 'string' || !OPERATION_ID.test(row.operationId) ||
        !(BYOK_PROVIDERS as readonly unknown[]).includes(row.provider) || (row.action !== 'set' && row.action !== 'remove')) {
      throw new PortalRequestError('service_unavailable')
    }
    const provider = row.provider as SubtitleProvider
    if (row.action === 'set') {
      if (typeof row.key !== 'string' || !KEY_SHAPE.test(row.key)) throw new PortalRequestError('service_unavailable')
      parsed.push({ provider, operationId: row.operationId, action: 'set', key: row.key })
    } else {
      if (row.key !== undefined) throw new PortalRequestError('service_unavailable')
      parsed.push({ provider, operationId: row.operationId, action: 'remove' })
    }
  }
  return parsed
}

/**
 * Porta de produção do passo `integrations` para as chaves de legenda: fala com o serviço pelo bearer da própria TV e
 * aplica pelo caminho normal (`saveSubtitleKey`/`removeSubtitleKey`). Antes de cada efeito confere que a identidade da TV
 * não mudou durante o passo.
 */
export function createSubtitleKeysRemoteStep(database: CatalogDb, connection: PortalConnection) {
  const tables = portalTables(database)
  return async (signal: AbortSignal): Promise<RemoteSubtitleResult> => {
    clearSubtitleKeyFeedback(database)
    const saved = await connection.ready()
    async function same() {
      signal.throwIfAborted()
      const current = await tables.device.get('device')
      if (!current || current.deviceId !== saved.deviceId || current.authEpoch !== saved.authEpoch ||
          current.recoveryEpoch !== saved.recoveryEpoch) throw new PortalRequestError('unauthorized')
    }
    return applyRemoteSubtitleKeys({
      async fetchInstructions(abort) {
        await same()
        const response = await connection.client.request<unknown>('/portal/v1/device/integrations/subtitles',
          { method: 'GET', bearer: saved.bearer, signal: abort })
        await same()
        return parseInstructions(response)
      },
      async ack(provider, operationId, ack, abort) {
        await same()
        await connection.client.request('/portal/v1/device/integrations/subtitles/ack',
          { bearer: saved.bearer, body: { provider, operationId, ...ack }, signal: abort })
        await same()
        recordSubtitleKeyFeedback(database, provider, ack)
      },
      async saveKey(provider, key) {
        await same()
        return saveSubtitleKey(provider, key, { database, signal })
      },
      async removeKey(provider) {
        await same()
        await removeSubtitleKey(provider, { database })
      },
    }, signal)
  }
}
