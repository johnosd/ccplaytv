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
import { invalidateSourceReadModels } from './readProjection'
import { deleteEpgForSource } from '../epg/epgRepository'
import { deleteCategoryItems } from './blockChunks'

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

/** Itens das categorias sob demanda de uma lista (voltam ao entrar na categoria). `true` se apagou algo. */
async function releaseSourceCategories(database: CatalogDb, sourceId: string): Promise<boolean> {
  let freed = false
  const categories = await database.categories.where('sourceId').equals(sourceId).toArray()
  for (const category of categories.filter((item) => item.fetchMode === 'on_demand' && item.id !== undefined)) {
    const had = (await database.categories.get(category.id as number))?.itemsFetchedAt !== undefined
    await deleteCategoryItems(database, category.id as number)
    if (had) freed = true
  }
  await database.transaction('rw', [database.categories, database.categoryBlocks,
    database.catalogReadManifests, database.catalogReadChunks], async () => {
    await invalidateSourceReadModels(sourceId, database)
  })
  return freed
}

/**
 * Libera cache refazível em níveis (um nível por transação, do mais barato ao mais caro).
 * @returns os níveis que apagaram algo.
 */
export async function releaseCatalogSpace(database: CatalogDb = db, keepSourceId = protectedSourceId): Promise<ReliefStep[]> {
  const released: ReliefStep[] = []
  const staging = database.table('sectionStaging')
  const stagingKeys = await staging.filter((row: { sourceId?: string }) => row.sourceId !== keepSourceId).primaryKeys()
  if (stagingKeys.length) { await staging.bulkDelete(stagingKeys); released.push('staging') }

  const discovery = database.table('discoveryCache')
  if (await discovery.count()) { await discovery.clear(); released.push('discovery') }

  const sourceIds = (await database.sources.toCollection().primaryKeys()) as string[]
  let freed = false
  for (const sourceId of sourceIds) {
    if (sourceId !== keepSourceId && await releaseSourceCategories(database, sourceId)) freed = true
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
  if (activeSourceId && await releaseSourceCategories(database, activeSourceId)) released.push('active-list')
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
