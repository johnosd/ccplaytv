/**
 * Onde estava o foco do detalhe de filme/série quando a pessoa saiu dele por
 * Semelhantes, Elenco ou "Configurar TMDB" (feature 035, FR-019 —
 * `logic/navegacao-detalhe.md`). Restaurado no RETURN por identidade, nunca
 * por índice (constitution, "Voltar Restaura Foco e Posição").
 */
export type DetailTabId = 'episodes' | 'details' | 'cast' | 'similar'

export interface DetailSnapshot {
  tab: DetailTabId
  /** `tmdb:<kind>:<tmdbId>` (cartão de Semelhantes) ou `person:<personId>` (Elenco). Ausente = foco na fileira de abas. */
  focusKey?: string
}

/** Título local a abrir a partir de um cartão "encontrado". */
export interface OpenTitleTarget {
  kind: 'movie' | 'series'
  itemId: string
}

/** Pessoa do elenco a abrir na página de ator. */
export interface OpenPersonTarget {
  personId: number
  name: string
}
