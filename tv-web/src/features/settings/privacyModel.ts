import type { HistoryClearScope, HistoryScopeSummary, HistorySummary } from '../../lib/catalog/historyRemoval'

/** Ordem das linhas da aba Privacidade (feature 036, §11): Filmes · Séries · Ambos. */
export const PRIVACY_SCOPES: HistoryClearScope[] = ['movies', 'series', 'both']

export const PRIVACY_SCOPE_LABEL: Record<HistoryClearScope, string> = {
  movies: 'Filmes',
  series: 'Séries',
  both: 'Filmes e Séries',
}

/** Rótulo de cada linha — os nomes da FR-023 ("Limpar ambos" para os dois). */
export const PRIVACY_ROW_LABEL: Record<HistoryClearScope, string> = {
  movies: 'Limpar histórico de Filmes',
  series: 'Limpar histórico de Séries',
  both: 'Limpar ambos',
}

/** `"{titles} títulos"` e `" · {unavailable} indisponíveis"` só quando há (§5) — "registros", nunca "séries" (A2). */
export function describeScope(summary: HistoryScopeSummary): string {
  const titles = `${summary.titles} ${summary.titles === 1 ? 'título' : 'títulos'}`
  return summary.unavailable > 0 ? `${titles} · ${summary.unavailable} indisponíveis` : titles
}

/** Escopo vazio = nada para limpar (FR-026). "Ambos" só fica vazio quando os dois estão. */
export function isScopeEmpty(summary: HistoryScopeSummary): boolean {
  return summary.titles + summary.unavailable === 0
}

/** O resumo das três linhas, com "Ambos" somando Filmes e Séries. */
export function scopeSummaries(summary: HistorySummary): Record<HistoryClearScope, HistoryScopeSummary> {
  return {
    movies: summary.movies,
    series: summary.series,
    both: {
      titles: summary.movies.titles + summary.series.titles,
      unavailable: summary.movies.unavailable + summary.series.unavailable,
      hasProgress: summary.movies.hasProgress || summary.series.hasProgress,
    },
  }
}
