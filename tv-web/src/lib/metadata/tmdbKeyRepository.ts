import { db, type CatalogDb, type IntegrationRecord, type IntegrationState } from '../catalog/db'
import { detectKeyFormat, tmdbAuthenticate, TmdbError, type TmdbCredential } from './tmdbConnector'
import type { MetadataOptions, SaveTmdbKeyFailure, SaveTmdbKeyResult, TmdbStatusView } from './types'

/**
 * Chave TMDB da própria pessoa (BYOK — constitution 1.6.0, feature 032 US2,
 * `logic/chave-tmdb.md`).
 *
 * **Porta restrita**, como `readCredential`: a chave crua só sai deste
 * módulo para o conector TMDB (`readTmdbCredential`). Nada aqui a devolve
 * para a interface — `TmdbStatusView` só tem a versão mascarada. Nenhum
 * `console.*` neste módulo, e nenhum erro de rede é repassado (a URL v3
 * carrega a chave).
 */

const TMDB_ID = 'tmdb'
/** Depois de um `429`, nenhuma chamada ao TMDB por este tempo (D-005). */
export const RATE_LIMIT_PAUSE_MS = 10 * 60 * 1000

/** `••••` + últimos 4 caracteres (FR-013). */
function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

function toStatus(record: IntegrationRecord): TmdbStatusView {
  return { state: record.state, maskedKey: maskKey(record.key), format: record.format, lastTestedAt: record.lastTestedAt }
}

/** Categoria de falha do conector → motivo mostrado a quem digitou a chave. */
function failureReason(error: unknown): SaveTmdbKeyFailure {
  if (error instanceof TmdbError) {
    if (error.kind === 'refused') return 'refused'
    if (error.kind === 'rate_limited') return 'rate_limited'
  }
  return 'offline'
}

function stateOf(error: unknown): IntegrationState {
  const reason = failureReason(error)
  return reason === 'invalid_format' ? 'offline' : reason
}

/**
 * Detecta o formato (v3/v4), testa contra o TMDB e só grava se o TMDB
 * aceitar (FR-011/FR-012). Chave recusada — ou qualquer falha de teste —
 * nunca é gravada, e a chave anterior (se houver) fica como estava.
 */
export async function saveTmdbKey(rawKey: string, options: MetadataOptions = {}): Promise<SaveTmdbKeyResult> {
  const database = options.database ?? db
  const key = rawKey.trim()
  const format = detectKeyFormat(key)
  if (format === undefined) return { ok: false, reason: 'invalid_format' }

  try {
    await tmdbAuthenticate({ key, format }, options.fetchImpl)
  } catch (error) {
    return { ok: false, reason: failureReason(error) }
  }

  const record: IntegrationRecord = {
    id: TMDB_ID,
    key,
    format,
    state: 'connected',
    lastTestedAt: options.now?.() ?? Date.now(),
  }
  await database.integrations.put(record)
  return { ok: true, status: toStatus(record) }
}

/** Estado para Integrações e dock — nunca a chave inteira (FR-013). */
export async function getTmdbStatus(options: MetadataOptions = {}): Promise<TmdbStatusView> {
  const record = await (options.database ?? db).integrations.get(TMDB_ID)
  return record ? toStatus(record) : { state: 'not_configured' }
}

/**
 * Botão "Testar": refaz a autenticação com a chave guardada e atualiza o
 * estado (200 → `connected`; 401 → `refused`; 429 → `rate_limited` + pausa;
 * rede → `offline`). Não apaga a chave em nenhum caso.
 */
export async function testTmdbKey(options: MetadataOptions = {}): Promise<TmdbStatusView> {
  const database = options.database ?? db
  const record = await database.integrations.get(TMDB_ID)
  if (!record) return { state: 'not_configured' }
  const now = options.now?.() ?? Date.now()

  try {
    await tmdbAuthenticate({ key: record.key, format: record.format }, options.fetchImpl)
    const next: IntegrationRecord = { ...record, state: 'connected', lastTestedAt: now, pausedUntil: undefined }
    await database.integrations.put(next)
    return toStatus(next)
  } catch (error) {
    const state = stateOf(error)
    const next: IntegrationRecord = {
      ...record,
      state,
      lastTestedAt: now,
      pausedUntil: state === 'rate_limited' ? now + RATE_LIMIT_PAUSE_MS : undefined,
    }
    await database.integrations.put(next)
    return toStatus(next)
  }
}

/** Apaga a chave e toda a metadata que veio do TMDB, preservando a do provedor (FR-014). */
export async function removeTmdbKey(options: MetadataOptions = {}): Promise<void> {
  const database: CatalogDb = options.database ?? db
  await database.transaction('rw', database.integrations, database.titleMetadata, async () => {
    await database.integrations.delete(TMDB_ID)
    await database.titleMetadata.toCollection().modify((record) => {
      delete record.tmdb
      delete record.tmdbFetchedAt
    })
  })
}

/** O que `titleMetadata` precisa para falar com o TMDB — e só ele lê isto. */
export interface UsableTmdbCredential extends TmdbCredential {
  state: IntegrationState
  pausedUntil?: number
}

/**
 * **Só para `titleMetadata.ts`.** Devolve a chave crua junto do estado; quem
 * chama nunca a guarda em estado de tela, log, query key ou mensagem.
 */
export async function readTmdbCredential(options: MetadataOptions = {}): Promise<UsableTmdbCredential | undefined> {
  const record = await (options.database ?? db).integrations.get(TMDB_ID)
  if (!record) return undefined
  return { key: record.key, format: record.format, state: record.state, pausedUntil: record.pausedUntil }
}

/**
 * Registra o resultado de uma chamada de enriquecimento (FR-024): o estado
 * de Integrações/dock reflete o problema sem um aviso a cada detalhe aberto.
 * `rate_limited` também liga a pausa.
 */
export async function markTmdbState(state: IntegrationState, options: MetadataOptions = {}): Promise<void> {
  const database = options.database ?? db
  const record = await database.integrations.get(TMDB_ID)
  if (!record) return
  const now = options.now?.() ?? Date.now()
  await database.integrations.put({
    ...record,
    state,
    pausedUntil: state === 'rate_limited' ? now + RATE_LIMIT_PAUSE_MS : undefined,
  })
}
