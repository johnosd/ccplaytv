/**
 * "↺ Histórico" de Filmes e Séries (feature 025, FR-009..FR-015) — leitura
 * local, sem rede, do que foi reproduzido na lista ativa, resolvido de volta
 * a registros do catálogo da geração ativa.
 *
 * Regras completas em `sdd/specs/025-filmes-series-ds-v14/logic/historico.md`.
 * STUB do sdd-plan: ponto de partida do sdd-execute (não travado).
 */

import { db, type CatalogDb, type CatalogRecord } from './db'

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

export async function loadHistory(
  sourceId: string,
  kind: HistoryKind,
  database: CatalogDb = db,
): Promise<HistoryResult> {
  void sourceId
  void kind
  void database
  throw new Error('not implemented')
}
