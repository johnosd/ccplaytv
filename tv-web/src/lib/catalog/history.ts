/**
 * "↺ Histórico" de Filmes e Séries (feature 025, FR-009..FR-015) — leitura
 * local, sem rede, do que foi reproduzido na lista ativa, resolvido de volta
 * a registros do catálogo da geração ativa.
 *
 * Regras completas em `sdd/specs/025-filmes-series-ds-v14/logic/historico.md`.
 * STUB do sdd-plan: ponto de partida do sdd-execute (não travado).
 */

import { db, type CatalogDb, type CatalogRecord } from './db'
import { resolveFavorites, resolveStableIds } from './catalogRepository'
import { getAdultScope } from './categoryAccess'
import { listFavorites, listPlayed, parseStableId, type StableIdParts } from './userStateRepository'

export type HistoryKind = 'movie' | 'series'

export interface HistoryResult {
  /**
   * Filmes (`kind: 'movie'`) ou séries (`kind: 'series'`), da reprodução
   * mais recente para a mais antiga. Em Séries, cada série uma única vez —
   * nunca um episódio.
   */
  records: CatalogRecord[]
  /**
   * Reproduções gravadas que não resolveram em nenhum registro exibível do
   * catálogo atual. Em Séries, conta episódios (não dá para saber de qual
   * série é um episódio que não está mais no catálogo).
   */
  unresolved: number
}

export interface HistoryPage extends HistoryResult {
  offset: number
  nextOffset?: number
  total: number
}

async function loadMovieHistory(sourceId: string, database: CatalogDb): Promise<HistoryResult> {
  const states = await listPlayed(sourceId, 'movie', database)
  const parts: StableIdParts[] = []
  let malformed = 0
  for (const state of states) {
    const parsed = parseStableId(state.stableId)
    if (parsed) parts.push(parsed)
    else malformed += 1
  }
  const { records, unresolved } = await resolveFavorites(sourceId, 'movie', parts, database)
  return { records, unresolved: unresolved + malformed }
}

/**
 * Séries: o dado gravado é por episódio, o card é por série
 * (`logic/historico.md` §4). Feature 039 (T034): em lote — todos os
 * episódios numa resolução, todas as séries-pai em outra; o mapa de
 * `resolveStableIds` diz qual episódio não resolveu, e a ordem é a dos
 * estados (mesma escolha de `resolveContinueWatching`).
 */
async function resolveSeriesHistory(states: Awaited<ReturnType<typeof listPlayed>>, sourceId: string, database: CatalogDb): Promise<HistoryResult> {
  const parsed = states.map((state) => parseStableId(state.stableId))
  const episodes = await resolveStableIds(
    sourceId,
    'episode',
    parsed.filter((parts): parts is StableIdParts => parts !== null),
    database,
  )
  const seriesParts = new Map<string, StableIdParts>()
  for (const episode of episodes.values()) {
    if (episode.seriesId && !seriesParts.has(episode.seriesId)) {
      seriesParts.set(episode.seriesId, { sourceId, kind: 'series', identifier: { type: 'id', value: episode.seriesId } })
    }
  }
  const series = await resolveStableIds(sourceId, 'series', [...seriesParts.values()], database)

  const seen = new Set<string>()
  const records: CatalogRecord[] = []
  let unresolved = 0
  for (const parts of parsed) {
    const episode = parts ? episodes.get(parts) : undefined
    if (!episode || !episode.seriesId) {
      unresolved += 1
      continue
    }
    // Reprodução mais recente da série já entrou numa posição anterior
    // (states vem do mais recente para o mais antigo) — não é um episódio
    // sem série exibível, então não conta como não resolvido.
    if (seen.has(episode.seriesId)) continue
    const record = series.get(seriesParts.get(episode.seriesId) as StableIdParts)
    if (!record) {
      unresolved += 1
      continue
    }
    seen.add(episode.seriesId)
    records.push(record)
  }

  return { records, unresolved }
}

async function loadSeriesHistory(sourceId: string, database: CatalogDb): Promise<HistoryResult> {
  return resolveSeriesHistory(await listPlayed(sourceId, 'episode', database), sourceId, database)
}

/** Lê somente uma faixa de estados antes de resolver os objetos do catálogo. */
export async function loadHistoryPage(
  sourceId: string,
  kind: HistoryKind,
  offset = 0,
  limit = 240,
  database: CatalogDb = db,
): Promise<HistoryPage> {
  const states = await listPlayed(sourceId, kind === 'movie' ? 'movie' : 'episode', database)
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLimit = Math.max(1, Math.floor(limit))
  const pageStates = states.slice(safeOffset, safeOffset + safeLimit)
  const result = kind === 'movie'
    ? await (async () => {
        const parts = pageStates.map((state) => parseStableId(state.stableId)).filter((parts): parts is StableIdParts => parts !== null)
        const resolved = await resolveFavorites(sourceId, 'movie', parts, database)
        return { records: resolved.records, unresolved: resolved.unresolved + pageStates.length - parts.length }
      })()
    : await resolveSeriesHistory(pageStates, sourceId, database)
  return {
    ...(await withoutAdult(sourceId, result, database)),
    offset: safeOffset,
    total: states.length,
    nextOffset: safeOffset + pageStates.length < states.length ? safeOffset + pageStates.length : undefined,
  }
}

/** Faixa equivalente de favoritos, mantendo a resolução fora da query da tela. */
export async function loadFavoritesPage(
  sourceId: string,
  kind: HistoryKind,
  offset = 0,
  limit = 240,
  database: CatalogDb = db,
): Promise<HistoryPage> {
  const favorites = await listFavorites(sourceId, kind, database)
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLimit = Math.max(1, Math.floor(limit))
  const page = favorites.slice(safeOffset, safeOffset + safeLimit)
  const parts = page.map((favorite) => parseStableId(favorite.stableId)).filter((parts): parts is StableIdParts => parts !== null)
  const resolved = await resolveFavorites(sourceId, kind, parts, database)
  return {
    records: resolved.records,
    unresolved: resolved.unresolved + page.length - parts.length,
    offset: safeOffset,
    total: favorites.length,
    nextOffset: safeOffset + page.length < favorites.length ? safeOffset + page.length : undefined,
  }
}

/**
 * "↺ Histórico" de Filmes ou Séries (feature 025, FR-009..FR-015) — leitura
 * local do que foi reproduzido (`lastWatched`), nunca da rede
 * (`logic/historico.md`).
 */
export async function loadHistory(
  sourceId: string,
  kind: HistoryKind,
  database: CatalogDb = db,
): Promise<HistoryResult> {
  return withoutAdult(sourceId, kind === 'movie' ? await loadMovieHistory(sourceId, database) : await loadSeriesHistory(sourceId, database), database)
}

/**
 * Feature 066 (FR-035, D-014): conteúdo adulto nunca aparece no ↺ Histórico — padrão, com ou sem controle parental,
 * mesmo com o PIN digitado. A reprodução continua gravada; o item só não é mostrado, e não conta como não resolvido.
 */
async function withoutAdult<T extends HistoryResult>(sourceId: string, result: T, database: CatalogDb): Promise<T> {
  const scope = await getAdultScope(sourceId, database)
  return { ...result, records: result.records.filter((record) => !scope.isAdult(record)) }
}
