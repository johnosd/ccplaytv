import { db, type CatalogDb, type IntegrationRecord, type IntegrationState } from '../catalog/db'
import { detectKeyFormat, tmdbAuthenticate, TmdbError, type TmdbCredential } from './tmdbConnector'
import type { MetadataOptions, SaveTmdbKeyFailure, SaveTmdbKeyResult, TmdbStatusView } from './types'
import { isRequestAbortError } from './requestDeadline'

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
const removalEpochs = new WeakMap<CatalogDb, number>()
const removalEpoch = (database: CatalogDb): number => removalEpochs.get(database) ?? 0

function newRevision(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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
 * Teto de uma pausa por limite de uso. Um Retry-After maior, ou uma pausa gravada com o relógio adiantado, deixaria o TMDB
 * calado por horas sem nada na tela explicar — passa a valer no máximo isto.
 */
export const MAX_PAUSE_MS = 60 * 60 * 1000

/** Pausa ainda válida, ignorando a que estiver além do teto (relógio que voltou ou valor absurdo gravado). */
export function validPause(pausedUntil: number | undefined, now: number): number | undefined {
  return pausedUntil !== undefined && pausedUntil > now && pausedUntil <= now + MAX_PAUSE_MS ? pausedUntil : undefined
}

function activePause(record: IntegrationRecord, now: number, retryAfterMs?: number): number | undefined {
  const retryAfter = retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? now + Math.min(retryAfterMs, MAX_PAUSE_MS) : undefined
  const existing = validPause(record.pausedUntil, now)
  if (retryAfter === undefined) return existing
  return existing === undefined ? retryAfter : Math.max(existing, retryAfter)
}

/** Legados recebem uma identidade de tentativa sem expor/derivar a chave. */
async function readIntegration(database: CatalogDb): Promise<IntegrationRecord | undefined> {
  const record = await database.integrations.get(TMDB_ID)
  if (!record || record.revision) return record
  return database.transaction('rw', database.integrations, async () => {
    const current = await database.integrations.get(TMDB_ID)
    if (!current || current.revision) return current
    const revised = { ...current, revision: newRevision() }
    await database.integrations.put(revised)
    return revised
  })
}

function resultRecord(record: IntegrationRecord, state: IntegrationState, now: number, retryAfterMs?: number): IntegrationRecord {
  const retry = state === 'rate_limited' && retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? retryAfterMs : state === 'rate_limited' ? RATE_LIMIT_PAUSE_MS : undefined
  const pausedUntil = activePause(record, now, retry)
  return { ...record, state, pausedUntil }
}

async function mutateRevision(database: CatalogDb, revision: string | undefined, epoch: number, update: (record: IntegrationRecord) => IntegrationRecord): Promise<IntegrationRecord | undefined> {
  return database.transaction('rw', database.integrations, async () => {
    const current = await database.integrations.get(TMDB_ID)
    if (!current || current.revision !== revision || removalEpoch(database) !== epoch) return current
    const next = update(current)
    await database.integrations.put(next)
    return next
  })
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
  const epoch = removalEpoch(database)
  const before = await readIntegration(database)
  if (removalEpoch(database) !== epoch) return { ok: false, reason: 'offline' }
  if (before?.key === key && activePause(before, options.now?.() ?? Date.now()) !== undefined) {
    return { ok: true, status: toStatus(before) }
  }

  try {
    await tmdbAuthenticate({ key, format }, options.fetchImpl, { signal: options.signal, now: options.now })
  } catch (error) {
    return { ok: false, reason: failureReason(error) }
  }

  return database.transaction('rw', database.integrations, async () => {
    const current = await database.integrations.get(TMDB_ID)
    if (removalEpoch(database) !== epoch || current?.revision !== before?.revision || options.signal?.aborted) {
      return { ok: false, reason: 'offline' }
    }
    const now = options.now?.() ?? Date.now()
    const record: IntegrationRecord = current?.key === key
      ? { ...resultRecord(current, 'connected', now), lastTestedAt: now }
      : { id: TMDB_ID, key, format, state: 'connected', lastTestedAt: now, revision: newRevision() }
    await database.integrations.put(record)
    return { ok: true, status: toStatus(record) }
  })
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
  const epoch = removalEpoch(database)
  const record = await readIntegration(database)
  if (!record) return { state: 'not_configured' }
  const now = options.now?.() ?? Date.now()
  if (removalEpoch(database) !== epoch) return getTmdbStatus(options)
  if (activePause(record, now) !== undefined) {
    // Durante a pausa nada é pedido ao TMDB; o estado diz por quê ("Limite de uso"), não "sem conexão".
    const paused = await mutateRevision(database, record.revision, epoch, current => ({
      ...current,
      state: 'rate_limited',
      lastTestedAt: now,
      pausedUntil: activePause(current, now),
    }))
    return paused ? toStatus(paused) : { state: 'not_configured' }
  }

  let state: IntegrationState = 'connected'
  let retryAfterMs: number | undefined
  try {
    await tmdbAuthenticate({ key: record.key, format: record.format }, options.fetchImpl, { signal: options.signal, now: options.now })
  } catch (error) {
    if (isRequestAbortError(error)) return getTmdbStatus(options)
    state = stateOf(error)
    retryAfterMs = error instanceof TmdbError ? error.retryAfterMs : undefined
  }
  if (options.signal?.aborted) return getTmdbStatus(options)
  const next = await mutateRevision(database, record.revision, epoch, current => ({
    ...resultRecord(current, state, options.now?.() ?? Date.now(), retryAfterMs),
    // A 429 already committed by another attempt wins over a late result.
    ...(current.pausedUntil !== undefined && current.pausedUntil > now && state !== 'rate_limited'
      ? { state: current.state, pausedUntil: current.pausedUntil } : {}),
    lastTestedAt: now,
  }))
  return next ? toStatus(next) : { state: 'not_configured' }
}

/** Apaga a chave e toda a metadata que veio do TMDB (inclusive filmografias), preservando a do provedor (FR-014). */
export async function removeTmdbKey(options: MetadataOptions = {}): Promise<void> {
  const database: CatalogDb = options.database ?? db
  removalEpochs.set(database, removalEpoch(database) + 1)
  await database.transaction('rw', database.integrations, database.titleMetadata, database.tmdbPeople, database.discoveryCache,
    database.showcaseExternalRows, async () => {
    await database.integrations.delete(TMDB_ID)
    // Filmografias também vieram do TMDB (feature 035, FR-021).
    await database.tmdbPeople.clear()
    // Top 10 e Dica também (feature 057): sem chave as fileiras somem, sem cache de outra época.
    await database.discoveryCache.clear()
    // Feature 087 (FR-011): e o resultado que o segundo plano já produziu sai na mesma transação — a tabela é só
    // projeção do que veio do TMDB, então remover a chave é a pessoa pedindo que ela saia inteira.
    await database.showcaseExternalRows.clear()
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
  revision: string
}

/**
 * **Só para `titleMetadata.ts`.** Devolve a chave crua junto do estado; quem
 * chama nunca a guarda em estado de tela, log, query key ou mensagem.
 */
export async function readTmdbCredential(options: MetadataOptions = {}): Promise<UsableTmdbCredential | undefined> {
  const record = await readIntegration(options.database ?? db)
  if (!record) return undefined
  return { key: record.key, format: record.format, state: record.state, pausedUntil: record.pausedUntil, revision: record.revision! }
}

/**
 * Registra o resultado de uma chamada de enriquecimento (FR-024): o estado
 * de Integrações/dock reflete o problema sem um aviso a cada detalhe aberto.
 * `rate_limited` também liga a pausa.
 */
export async function markTmdbState(state: IntegrationState, options: MetadataOptions = {}, retryAfterMs?: number): Promise<void> {
  const database = options.database ?? db
  const epoch = removalEpoch(database)
  const record = await readIntegration(database)
  if (!record) return
  const revision = options.expectedCredentialRevision ?? record.revision
  await mutateRevision(database, revision, epoch, current => resultRecord(current, state, options.now?.() ?? Date.now(), retryAfterMs))
}
