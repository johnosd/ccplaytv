/**
 * Remover do "↺ Histórico" e limpar o Histórico (feature 036, DS V14
 * §13.3/§48.4). Regras completas em
 * `sdd/specs/036-limpar-historico/logic/remocao-historico.md`.
 *
 * Esconder, nunca apagar `lastWatched` (D-001): "Continuar assistindo" lê o
 * mesmo campo. Nenhum caminho daqui escreve `isFavorite`, `favoritedAt`,
 * `completedAt` ou `lastWatched` (D-004).
 */

import { listEpisodes } from './catalogRepository'
import { db, type CatalogDb, type UserStateRecord } from './db'
import { loadHistory } from './history'
import { buildStableId, isInHistory } from './userStateRepository'

export { isInHistory }

/**
 * `'history-only'` = só tira do Histórico (a retomada fica, o item continua em
 * "Continuar assistindo"); `'history-and-progress'` = tira do Histórico e apaga
 * a retomada. Nenhum dos dois toca favorito nem `completedAt` (FR-012/FR-013).
 */
export type HistoryRemovalMode = 'history-only' | 'history-and-progress'

/** Escopo da limpeza em lote da aba Privacidade (FR-023). */
export type HistoryClearScope = 'movies' | 'series' | 'both'

/** O que a aba Privacidade mostra para um escopo (FR-023/FR-024/FR-026). */
export interface HistoryScopeSummary {
  /** Títulos exibíveis no "↺ Histórico" (filmes, ou séries agregadas). */
  titles: number
  /** Registros de histórico que não resolvem no catálogo atual (FR-025). */
  unavailable: number
  /** Algum registro deste escopo tem posição de retomada — decide se a confirmação oferece "apagar progresso". */
  hasProgress: boolean
}

export interface HistorySummary {
  movies: HistoryScopeSummary
  series: HistoryScopeSummary
}

/**
 * O estado depois de remover (`logic/remocao-historico.md` §2–§4), ou `null`
 * quando não há nada a mudar. `historyHiddenAt = max(agora, lastWatched)`
 * garante `lastWatched <= historyHiddenAt` mesmo com relógio igual (§1); o
 * progresso some com `'history-and-progress'` mesmo num item já escondido
 * (D-005).
 */
function removedState(state: UserStateRecord, mode: HistoryRemovalMode, now: number): UserStateRecord | null {
  const hide = isInHistory(state)
  const dropProgress = mode === 'history-and-progress' && state.progressSeconds !== undefined
  if (!hide && !dropProgress) return null
  const next: UserStateRecord = { ...state, updatedAt: now }
  if (hide) next.historyHiddenAt = Math.max(now, state.lastWatched ?? now)
  if (dropProgress) next.progressSeconds = undefined
  return next
}

/**
 * `stableId`s dos episódios da série na geração ativa (D-009) — o mesmo
 * cálculo de `useSeriesWatchedSummary`. Episódio sem identidade estável fica
 * de fora: nunca entrou no Histórico.
 */
async function seriesEpisodeStableIds(sourceId: string, seriesId: string, database: CatalogDb): Promise<string[]> {
  const episodes = await listEpisodes(sourceId, seriesId, database)
  const stableIds: string[] = []
  for (const episode of episodes) {
    try {
      stableIds.push(
        buildStableId({
          sourceId,
          kind: 'episode',
          providerStreamId: episode.providerStreamId,
          seriesId: episode.seriesId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          originalName: episode.originalName,
        }),
      )
    } catch {
      // Sem identidade estável: pula.
    }
  }
  return stableIds
}

/**
 * O título tem retomada? Decide se a confirmação oferece "apagar progresso"
 * (FR-007, §8) — lido antes de abrir, só IndexedDB. Série: algum episódio.
 */
export async function historyTargetHasProgress(
  target: { kind: 'movie'; stableId: string } | { kind: 'series'; sourceId: string; seriesId: string },
  database: CatalogDb = db,
): Promise<boolean> {
  const stableIds =
    target.kind === 'movie' ? [target.stableId] : await seriesEpisodeStableIds(target.sourceId, target.seriesId, database)
  const states = await database.userStates.bulkGet(stableIds)
  return states.some((state) => (state?.progressSeconds ?? 0) > 0)
}

/** Remove um filme do Histórico (FR-008/FR-009). Fora do Histórico, não faz nada. */
export async function removeMovieFromHistory(
  stableId: string,
  sourceId: string,
  mode: HistoryRemovalMode,
  database: CatalogDb = db,
): Promise<void> {
  await database.transaction('rw', database.userStates, async () => {
    const state = await database.userStates.get(stableId)
    if (!state || state.sourceId !== sourceId || !isInHistory(state)) return
    const next = removedState(state, mode, Date.now())
    if (next) await database.userStates.put(next)
  })
}

/**
 * Remove uma série do Histórico: todos os episódios dela conhecidos na geração
 * ativa, de todas as temporadas (FR-015). `seriesId` é o do catálogo
 * (`CatalogRecord.seriesId`), nunca o id local.
 */
export async function removeSeriesFromHistory(
  sourceId: string,
  seriesId: string,
  mode: HistoryRemovalMode,
  database: CatalogDb = db,
): Promise<void> {
  const stableIds = await seriesEpisodeStableIds(sourceId, seriesId, database)
  if (stableIds.length === 0) return

  await database.transaction('rw', database.userStates, async () => {
    const now = Date.now()
    const states = await database.userStates.bulkGet(stableIds)
    const changed = states.flatMap((state) => (state ? (removedState(state, mode, now) ?? []) : []))
    if (changed.length > 0) await database.userStates.bulkPut(changed)
  })
}

function scopePrefixes(sourceId: string, scope: HistoryClearScope): string[] {
  const movies = `${sourceId}|movie|`
  const episodes = `${sourceId}|episode|`
  if (scope === 'movies') return [movies]
  if (scope === 'series') return [episodes]
  return [movies, episodes]
}

/**
 * Limpa o Histórico de Filmes, de Séries ou de ambos da lista `sourceId` —
 * inclusive registros que não resolvem mais no catálogo (FR-025). Nunca toca
 * outra lista (FR-014).
 */
export async function clearHistory(
  sourceId: string,
  scope: HistoryClearScope,
  mode: HistoryRemovalMode,
  database: CatalogDb = db,
): Promise<void> {
  const prefixes = scopePrefixes(sourceId, scope)
  await database.transaction('rw', database.userStates, async () => {
    const now = Date.now()
    const states = await database.userStates.where('sourceId').equals(sourceId).toArray()
    const changed = states.flatMap((state) =>
      prefixes.some((prefix) => state.stableId.startsWith(prefix)) ? (removedState(state, mode, now) ?? []) : [],
    )
    if (changed.length > 0) await database.userStates.bulkPut(changed)
  })
}

/** Contagens e "tem progresso" por escopo, para a aba Privacidade (FR-023). */
export async function summarizeHistory(sourceId: string, database: CatalogDb = db): Promise<HistorySummary> {
  const [movies, series, states] = await Promise.all([
    loadHistory(sourceId, 'movie', database),
    loadHistory(sourceId, 'series', database),
    database.userStates.where('sourceId').equals(sourceId).toArray(),
  ])
  const hasProgress = (prefix: string) =>
    states.some((state) => state.stableId.startsWith(prefix) && isInHistory(state) && (state.progressSeconds ?? 0) > 0)
  return {
    movies: { titles: movies.records.length, unavailable: movies.unresolved, hasProgress: hasProgress(`${sourceId}|movie|`) },
    series: { titles: series.records.length, unavailable: series.unresolved, hasProgress: hasProgress(`${sourceId}|episode|`) },
  }
}
