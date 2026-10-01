/**
 * Remover do "↺ Histórico" e limpar o Histórico (feature 036, DS V14
 * §13.3/§48.4). Regras completas em
 * `sdd/specs/036-limpar-historico/logic/remocao-historico.md`.
 *
 * STUB do sdd-plan: assinaturas travadas pelos testes de contrato
 * (`historyRemoval.limpar-historico.contract.test.ts`); o corpo é do
 * sdd-execute.
 */

import { db, type CatalogDb, type UserStateRecord } from './db'

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

/** Regra única de "está no Histórico" (`logic/remocao-historico.md` §1). */
export function isInHistory(state: Pick<UserStateRecord, 'lastWatched' | 'historyHiddenAt'> | null | undefined): boolean {
  void state
  throw new Error('not implemented')
}

/** Remove um filme do Histórico (FR-008/FR-009). */
export async function removeMovieFromHistory(
  stableId: string,
  sourceId: string,
  mode: HistoryRemovalMode,
  database: CatalogDb = db,
): Promise<void> {
  void stableId
  void sourceId
  void mode
  void database
  throw new Error('not implemented')
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
  void sourceId
  void seriesId
  void mode
  void database
  throw new Error('not implemented')
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
  void sourceId
  void scope
  void mode
  void database
  throw new Error('not implemented')
}

/** Contagens e "tem progresso" por escopo, para a aba Privacidade (FR-023). */
export async function summarizeHistory(sourceId: string, database: CatalogDb = db): Promise<HistorySummary> {
  void sourceId
  void database
  throw new Error('not implemented')
}
