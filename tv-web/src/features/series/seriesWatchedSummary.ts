/**
 * Agregação "Em dia" por série (feature 019, D-007/D-008,
 * `logic/agregacao-serie.md`). Função pura — sem React, sem banco —
 * consumida por `useSeriesWatchedSummary` (`catalogApi.ts`).
 */

export interface SeriesWatchedSummary {
  /** Quantos episódios desta série já são conhecidos localmente (D-007). */
  known: number
  /** Quantos desses episódios conhecidos já estão marcados como assistidos. */
  watched: number
  /**
   * Só `true` quando `known > 0` E todos os conhecidos estão assistidos —
   * nunca com cobertura zero ou parcial (`logic/agregacao-serie.md`).
   */
  upToDate: boolean
}

/**
 * `episodes` é a lista de estados dos episódios já conhecidos de UMA série
 * (nunca busca mais nem soma um "total esperado" externo — `known` é
 * sempre `episodes.length`, ver `logic/agregacao-serie.md`).
 */
export function summarizeSeriesWatched(episodes: { completedAt?: number }[]): SeriesWatchedSummary {
  const known = episodes.length
  const watched = episodes.filter((episode) => episode.completedAt != null).length
  return { known, watched, upToDate: known > 0 && watched === known }
}
