/**
 * Candidatos e primitivas de liberação do orçamento (feature 082, `logic/orcamento.md` §3–§4). O planejador puro está em
 * `storageBudget.ts`; aqui só se monta a lista do que **pode** sair e se apaga o escolhido.
 *
 * Nunca saem (D-007): estado da pessoa, categorias `eager`/`stored` (M3U — não voltam pela rede), a categoria em uso, a
 * do item tocando, e as categorias da lista ativa com favorito ou "Continuar assistindo". Liberada = nunca obtida; ao
 * obter de novo, os ids voltam iguais (`blockItemId`).
 */
import type { CatalogDb, CatalogItemKind, CategoryRecord } from './db'
import type { ReleaseCandidate } from './storageBudget'
import type { CatalogLedger } from './storageLedger'
import { guideStoredBytes, LEGACY_EPG_ROW_BYTES, METADATA_BYTES } from './storageLedger'
import { deleteCategoryItems } from './blockChunks'
import { deleteEpgForSource } from '../epg/epgRepository'
import { clearStagedItemsOfOtherSources, isQuotaError, resolveStableIds } from './catalogRepository'
import { parseStableId, type StableIdParts } from './userStateRepository'

export interface CandidateContext {
  activeSourceId?: string
  protectCategoryId?: number
  ledger: CatalogLedger
  /** Último uso de uma categoria (memória desta sessão ou disco); 0 = nunca. */
  lastUsedOf: (category: CategoryRecord) => number
  /** Usada há menos de `PIN_WINDOW_MS` (tela, detalhe, player). */
  isRecent: (category: CategoryRecord) => boolean
  /** Categorias da lista ativa com favorito ou "Continuar assistindo" (`pinnedUserCategories`). */
  pinnedCategoryIds?: ReadonlySet<number>
}

/** Só categoria que volta pela rede pode sair. */
function refetchable(category: CategoryRecord): boolean {
  return category.fetchMode === 'on_demand'
}

const KEY_MIN = -1
const KEY_MAX = Number.MAX_SAFE_INTEGER

/** Partes do preparo de OUTRAS listas, só por contagem de índice: nunca lê os itens preparados (feature 085, D-002). */
async function stagedPartsOfOthers(database: CatalogDb, activeSourceId?: string): Promise<number> {
  const table = database.table('sectionStaging')
  const total = await table.count()
  if (activeSourceId === undefined || total === 0) return total
  const own = await table.where('[sourceId+categoryId]').between([activeSourceId, KEY_MIN], [activeSourceId, KEY_MAX], true, true).count()
  return total - own
}

/** Monta os candidatos de `logic/orcamento.md` §3, na ordem de entrada (o planejador ordena). */
export async function releaseCandidates(database: CatalogDb, context: CandidateContext, probe?: Record<string, number>): Promise<ReleaseCandidate[]> {
  const lap = (key: string, since: number) => { if (probe) probe[key] = (probe[key] ?? 0) + (performance.now() - since) }
  const result: ReleaseCandidate[] = []
  const stagingStart = performance.now()
  const staging = await stagedPartsOfOthers(database, context.activeSourceId)
  const discovery = await database.table('discoveryCache').count()
  if (staging + discovery > 0) {
    result.push({ key: 'temporary', scope: 'temporary', bytes: (staging + discovery) * METADATA_BYTES, lastUsedAt: 0,
      refetchable: true, pinned: false })
  }
  lap('candStagingMs', stagingStart)
  const sources = await database.sources.toArray()
  const guideStart = performance.now()
  // Guia ainda em linhas (formato anterior à 082, ~10× maior que o comprimido): refazível pela próxima sincronização.
  for (const source of sources) {
    // O ledger já contou as linhas antigas do guia desta lista: refazer a contagem custava ~0,7 s no app real (085).
    const legacyRows = context.ledger.legacyGuideRows?.[source.id] ?? (await guideStoredBytes(database, source)).legacyRows
    if (legacyRows === 0) continue
    result.push({ key: `legacy-guide:${source.id}`, scope: 'temporary', sourceId: source.id, bytes: legacyRows * LEGACY_EPG_ROW_BYTES,
      lastUsedAt: 0, refetchable: true, pinned: false })
  }
  lap('candGuideMs', guideStart)
  for (const source of sources) {
    if (source.id === context.activeSourceId) continue
    const bytes = context.ledger.bySource[source.id] ?? 0
    if (bytes > 0) {
      result.push({ key: `list:${source.id}`, scope: 'inactive-list', sourceId: source.id, bytes,
        lastUsedAt: source.lastActivatedAt ?? 0, refetchable: true, pinned: false })
    }
  }
  if (context.activeSourceId) {
    const categoriesStart = performance.now()
    const categories = await database.categories.where('sourceId').equals(context.activeSourceId).toArray()
    lap('candCategoriesMs', categoriesStart)
    for (const category of categories) {
      const categoryId = category.id as number
      const bytes = context.ledger.byCategory.get(categoryId) ?? 0
      if (bytes <= 0) continue
      result.push({
        key: `category:${categoryId}`,
        scope: 'active-category',
        sourceId: category.sourceId,
        categoryId,
        bytes,
        lastUsedAt: context.lastUsedOf(category),
        refetchable: refetchable(category),
        pinned: categoryId === context.protectCategoryId || context.isRecent(category) || !!context.pinnedCategoryIds?.has(categoryId),
      })
    }
  }
  return result
}

const KINDS: CatalogItemKind[] = ['channel', 'movie', 'series', 'episode']

/**
 * Categorias da lista ativa que contêm favorito ou item de "Continuar assistindo" (achado A-01, R-009). O trabalho é
 * limitado ao que a pessoa já interagiu, e só roda quando o plano chegaria a uma categoria da lista ativa.
 */
export async function pinnedUserCategories(database: CatalogDb, sourceId: string): Promise<Set<number>> {
  const states = (await database.userStates.where('sourceId').equals(sourceId).toArray())
    .filter((state) => state.isFavorite || ((state.progressSeconds ?? 0) > 0 && state.completedAt === undefined && state.historyHiddenAt === undefined))
  const byKind = new Map<CatalogItemKind, StableIdParts[]>()
  for (const state of states) {
    const parts = parseStableId(state.stableId)
    if (!parts || !KINDS.includes(parts.kind)) continue
    byKind.set(parts.kind, [...(byKind.get(parts.kind) ?? []), parts])
  }
  const pinned = new Set<number>()
  const seriesOrders = new Set<number>()
  for (const [kind, parts] of byKind) {
    for (const record of (await resolveStableIds(sourceId, kind, parts, database)).values()) {
      // Episódio não tem categoria própria: protege a categoria da série (mesmo `groupOrder`).
      if (record.kind === 'episode') seriesOrders.add(record.groupOrder)
      else if (record.categoryId !== undefined) pinned.add(record.categoryId)
    }
  }
  if (seriesOrders.size > 0) {
    const generation = (await database.sources.get(sourceId))?.activeGeneration
    for (const category of await database.categories.where('sourceId').equals(sourceId).toArray()) {
      if (category.kind === 'series' && category.generation === generation && seriesOrders.has(category.order)) pinned.add(category.id as number)
    }
  }
  return pinned
}

/** Itens das categorias sob demanda de uma lista (voltam ao entrar). Devolve as categorias liberadas. */
export async function releaseListCategories(database: CatalogDb, sourceId: string): Promise<number[]> {
  const released: number[] = []
  for (const category of await database.categories.where('sourceId').equals(sourceId).toArray()) {
    if (!refetchable(category) || category.id === undefined) continue
    const had = category.itemsFetchedAt !== undefined || (category.itemsCount ?? 0) > 0 || category.storedBytes !== undefined
    await deleteCategoryItems(database, category.id)
    if (had) released.push(category.id)
  }
  return released
}

/**
 * Tudo o que pode ser refeito de uma lista NÃO ativa: categorias sob demanda, guia (fica "ainda não sincronizado",
 * nunca vazio calado) e metadados. A configuração da lista e o estado da pessoa ficam.
 */
export async function releaseInactiveList(database: CatalogDb, sourceId: string): Promise<number[]> {
  const released = await releaseListCategories(database, sourceId)
  const source = await database.sources.get(sourceId)
  if (source && (source.epgActiveGeneration !== undefined || source.epgStoredBytes !== undefined)) await releaseGuide(database, sourceId)
  await database.titleMetadata.where('sourceId').equals(sourceId).delete()
  return released
}

/**
 * Apaga o guia de uma lista (as remoções vêm antes, em transações próprias). Acima da cota até o `update` da fonte
 * falha: o guia fica vazio até a próxima sincronização, que regrava — melhor que não liberar nada.
 */
async function releaseGuide(database: CatalogDb, sourceId: string): Promise<void> {
  try {
    await deleteEpgForSource(sourceId, database)
    await database.sources.update(sourceId, { epgLastSyncAt: undefined })
  } catch (error) {
    if (!isQuotaError(error)) throw error
  }
}

/** Preparo de seção de outras listas e o cache de descobertas do TMDB. */
export async function releaseTemporary(database: CatalogDb, keepSourceId?: string): Promise<{ staging: boolean; discovery: boolean }> {
  // Chaves do índice e apagar por faixa: nunca desserializa os itens preparados (feature 085, D-002).
  const stagingCleared = await clearStagedItemsOfOtherSources(keepSourceId, database)
  const discovery = database.table('discoveryCache')
  const hadDiscovery = (await discovery.count()) > 0
  if (hadDiscovery) await discovery.clear()
  return { staging: stagingCleared, discovery: hadDiscovery }
}

/** Libera um candidato escolhido pelo planejador. Devolve `[sourceId, categorias liberadas]` para avisar as telas. */
export async function releaseCandidate(database: CatalogDb, candidate: ReleaseCandidate, activeSourceId?: string): Promise<[string, number[]] | undefined> {
  if (candidate.key.startsWith('legacy-guide:') && candidate.sourceId) {
    // O guia fica "ainda não sincronizado" (nunca vazio calado); a próxima sincronização grava comprimido.
    await releaseGuide(database, candidate.sourceId)
    return undefined
  }
  if (candidate.scope === 'temporary') {
    await releaseTemporary(database, activeSourceId)
    return undefined
  }
  if (candidate.scope === 'inactive-list' && candidate.sourceId) return [candidate.sourceId, await releaseInactiveList(database, candidate.sourceId)]
  if (candidate.scope === 'active-category' && candidate.categoryId !== undefined && candidate.sourceId) {
    await deleteCategoryItems(database, candidate.categoryId)
    return [candidate.sourceId, [candidate.categoryId]]
  }
  return undefined
}
