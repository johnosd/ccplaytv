import type { HistoryClearScope, HistoryScopeSummary, HistorySummary } from '../../lib/catalog/historyRemoval'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { createTranslator, type Translator } from '../../lib/i18n/translate'

/** Ordem das linhas da aba Privacidade (feature 036, §11): Filmes · Séries · Ambos. */
export const PRIVACY_SCOPES: HistoryClearScope[] = ['movies', 'series', 'both']

/** Nome do escopo no catálogo (feature 054): o texto vem de `t(chave)`. */
export const PRIVACY_SCOPE_LABEL_KEY: Record<HistoryClearScope, MessageKey> = {
  movies: 'settings.privacy.scope.movies',
  series: 'settings.privacy.scope.series',
  both: 'settings.privacy.scope.both',
}

/** Rótulo de cada linha — os nomes da FR-023 ("Limpar ambos" para os dois). */
export const PRIVACY_ROW_LABEL_KEY: Record<HistoryClearScope, MessageKey> = {
  movies: 'settings.privacy.row.movies',
  series: 'settings.privacy.row.series',
  both: 'settings.privacy.row.both',
}

/**
 * `"{titles} títulos"` e `" · {unavailable} indisponíveis"` só quando há (§5) — "registros", nunca "séries" (A2).
 * `t` omitido = português (os testes antigos).
 */
export function describeScope(summary: HistoryScopeSummary, t: Translator = createTranslator('pt')): string {
  const titles = t.plural('settings.privacy.titles', summary.titles)
  return summary.unavailable > 0 ? t('settings.privacy.withUnavailable', { titles, n: summary.unavailable }) : titles
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
