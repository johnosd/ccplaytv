/**
 * Folga e liberação de espaço do IndexedDB (bug `armazenamento-app-cheio-na-tv-impede`, 2026-10-18).
 *
 * Na TV, a pré-carga do catálogo enchia o banco até a cota e só então parava; dali em diante QUALQUER gravação era
 * abortada (`AbortError` com `QuotaExceededError`), inclusive a licença paga, o pareamento e o desvincular. Duas
 * defesas: a pré-carga para antes, guardando uma folga (`hasStorageHeadroom`), e as gravações críticas pequenas
 * liberam cache refazível e tentam de novo (`withStorageRelief`).
 *
 * Só sai o que pode ser refeito: preparo de seções de outras listas, o cache de descobertas do TMDB e os itens de
 * categoria das listas NÃO ativas (a categoria volta a ser obtida ao entrar nela — cobertura parcial é o estado
 * normal desde a 010); em emergência de gravação crítica, também a programação (EPG) e o cache da lista ativa.
 * Nunca sai estado da pessoa (favoritos, histórico, progresso, PINs, preferências), listas, pareamento, licença,
 * configuração de EPG, categorias `eager` nem o arquivo M3U guardado (`storedEntries`).
 */
import { db, type CatalogDb } from './db'
import { isQuotaError, StorageFullError } from './catalogRepository'
import { deleteEpgForSource } from '../epg/epgRepository'
import { releaseInactiveList, releaseListCategories, releaseTemporary } from './storageRelease'

const MB = 1024 * 1024
/**
 * Folga mínima; com cota grande, 10 % dela. A TV de referência dá só ~80 MB ao app (medido em 2026-10-18; o
 * `unlimitedstorage` não vale para TV), então o mínimo é pequeno — 64 MB desligaria a pré-carga.
 */
export const STORAGE_HEADROOM_MIN_BYTES = 8 * MB
export const STORAGE_HEADROOM_RATIO = 0.1

export interface StorageEstimate { usage: number; quota: number }

export function storageHeadroom(quota: number) {
  return Math.max(STORAGE_HEADROOM_MIN_BYTES, quota * STORAGE_HEADROOM_RATIO)
}

/** `navigator.storage.estimate()` sem lançar; `undefined` quando o navegador não informa. */
export async function readStorageEstimate(): Promise<StorageEstimate | undefined> {
  try {
    const value = await globalThis.navigator?.storage?.estimate?.()
    const usage = value?.usage, quota = value?.quota
    if (typeof usage !== 'number' || typeof quota !== 'number' || !Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return undefined
    return { usage, quota }
  } catch { return undefined }
}

/** Ainda cabe mais catálogo sem comer a folga? Sem estimativa, não bloqueia (comportamento anterior). */
export async function hasStorageHeadroom(estimate?: StorageEstimate): Promise<boolean> {
  const value = estimate ?? await readStorageEstimate()
  if (!value) return true
  return value.usage <= value.quota - storageHeadroom(value.quota)
}

// A lista ativa só perde cache em emergência; quem a conhece (a pré-carga) a registra aqui.
let protectedSourceId: string | undefined
export function protectCatalogSource(sourceId: string | undefined) { protectedSourceId = sourceId }
export function protectedCatalogSource() { return protectedSourceId }

export type ReliefStep = 'staging' | 'discovery' | 'inactive-lists' | 'epg' | 'active-list'

/**
 * Libera cache refazível em níveis (um nível por transação, do mais barato ao mais caro) — os mesmos candidatos do
 * orçamento (feature 082, `storageRelease.ts`): temporários, depois as listas NÃO ativas inteiras (categorias sob
 * demanda, guia e metadados).
 * @returns os níveis que apagaram algo.
 */
export async function releaseCatalogSpace(database: CatalogDb = db, keepSourceId = protectedSourceId): Promise<ReliefStep[]> {
  const released: ReliefStep[] = []
  const temporary = await releaseTemporary(database, keepSourceId)
  if (temporary.staging) released.push('staging')
  if (temporary.discovery) released.push('discovery')
  let freed = false
  for (const sourceId of (await database.sources.toCollection().primaryKeys()) as string[]) {
    if (sourceId !== keepSourceId && (await releaseInactiveList(database, sourceId)).length > 0) freed = true
  }
  if (freed) released.push('inactive-lists')
  return released
}

/**
 * Último recurso de uma gravação crítica (decisão do usuário, 2026-10-18): a programação de todas as listas — a
 * configuração fica e o guia passa a "ainda não sincronizado", nunca vazio calado — e o cache de categorias da lista
 * ATIVA (volta ao entrar). Licença paga e pareamento valem mais que cache refazível.
 */
export async function releaseEmergencySpace(database: CatalogDb = db, activeSourceId = protectedSourceId): Promise<ReliefStep[]> {
  const released: ReliefStep[] = []
  const sources = await database.sources.toArray()
  let epg = false
  for (const source of sources) {
    if (source.epgActiveGeneration === undefined) continue
    await deleteEpgForSource(source.id, database)
    await database.sources.update(source.id, { epgLastSyncAt: undefined })
    epg = true
  }
  if (epg) released.push('epg')
  if (activeSourceId && (await releaseListCategories(database, activeSourceId)).length > 0) released.push('active-list')
  return released
}

/**
 * Gravação crítica e pequena (licença, pareamento, desvincular): se a cota estourar, libera cache refazível e repete;
 * se ainda estourar, libera em emergência e repete uma última vez. Sem espaço mesmo assim, `StorageFullError` (o
 * chamador mostra o limite de armazenamento do app).
 */
export async function withStorageRelief<T>(write: () => Promise<T>, database: CatalogDb = db): Promise<T> {
  try { return await write() } catch (error) {
    if (!isQuotaError(error)) throw error
  }
  for (const release of [releaseCatalogSpace, releaseEmergencySpace]) {
    const released = await release(database).catch(() => [] as ReliefStep[])
    if (!released.length) continue
    try { return await write() } catch (error) {
      if (!isQuotaError(error)) throw error
    }
  }
  throw new StorageFullError()
}
