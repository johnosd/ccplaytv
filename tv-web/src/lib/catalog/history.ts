/**
 * "↺ Histórico" de Filmes e Séries (feature 025, FR-009..FR-015) — leitura
 * local, sem rede, do que foi reproduzido na lista ativa, resolvido de volta
 * a registros do catálogo da geração ativa.
 *
 * Regras completas em `sdd/specs/025-filmes-series-ds-v14/logic/historico.md`.
 * STUB do sdd-plan: ponto de partida do sdd-execute (não travado).
 */

import { db, type CatalogDb, type CatalogRecord } from './db'
import { resolveFavorites } from './catalogRepository'
import { listPlayed, parseStableId, type StableIdParts } from './userStateRepository'

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
 * (`logic/historico.md` §4). Resolve um estado por vez (nunca em lote) para
 * saber exatamente qual episódio não resolveu e manter a ordem — a mesma
 * escolha de `resolveContinueWatching`.
 */
async function loadSeriesHistory(sourceId: string, database: CatalogDb): Promise<HistoryResult> {
  const states = await listPlayed(sourceId, 'episode', database)
  const seen = new Set<string>()
  const records: CatalogRecord[] = []
  let unresolved = 0

  for (const state of states) {
    const parts = parseStableId(state.stableId)
    if (!parts) {
      unresolved += 1
      continue
    }
    const { records: episodeRecords } = await resolveFavorites(sourceId, 'episode', [parts], database)
    const episode = episodeRecords[0]
    if (!episode || !episode.seriesId) {
      unresolved += 1
      continue
    }
    // Reprodução mais recente da série já entrou numa posição anterior
    // (states vem do mais recente para o mais antigo) — não é um episódio
    // sem série exibível, então não conta como não resolvido.
    if (seen.has(episode.seriesId)) continue

    const seriesParts: StableIdParts = {
      sourceId,
      kind: 'series',
      identifier: { type: 'id', value: episode.seriesId },
    }
    const { records: seriesRecords } = await resolveFavorites(sourceId, 'series', [seriesParts], database)
    const series = seriesRecords[0]
    if (!series) {
      unresolved += 1
      continue
    }
    seen.add(episode.seriesId)
    records.push(series)
  }

  return { records, unresolved }
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
  return kind === 'movie' ? loadMovieHistory(sourceId, database) : loadSeriesHistory(sourceId, database)
}
