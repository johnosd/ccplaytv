import type { CatalogDb } from '../catalog/db'

/**
 * Metadata descritiva de filme/série (feature 032, `data-model.md`,
 * `logic/metadados-e-casamento.md`). Cada campo carrega a origem: o
 * provedor sempre vence; o TMDB só preenche o que o provedor deixou vazio
 * (FR-007/FR-018). Campo ausente = nenhuma fonte tem valor real — nunca um
 * texto de preenchimento.
 */
export type MetadataOrigin = 'provider' | 'tmdb'

export interface MetadataField<T> {
  value: T
  origin: MetadataOrigin
}

export interface TitleMetadataView {
  /** `language` só existe quando a sinopse NÃO está em português (FR-021) — código ISO 639-1. */
  synopsis?: MetadataField<string> & { language?: string }
  backdropUrl?: MetadataField<string>
  /** Gêneros já juntos para exibição ("Terror, Drama"). Nunca substitui a categoria da fonte. */
  genres?: MetadataField<string>
  durationSeconds?: MetadataField<number>
  director?: MetadataField<string>
  country?: MetadataField<string>
  /** Elenco em texto ("A, B, C"). A aba Elenco navegável é o item 45 do backlog. */
  cast?: MetadataField<string>
}

export type TmdbKeyFormat = 'v3' | 'v4'

export type TmdbState = 'not_configured' | 'connected' | 'refused' | 'offline' | 'rate_limited'

/**
 * O que a interface pode ver do TMDB (FR-010/FR-013). **Nunca** carrega a
 * chave — só a versão mascarada (`••••` + 4 últimos caracteres).
 */
export interface TmdbStatusView {
  state: TmdbState
  maskedKey?: string
  format?: TmdbKeyFormat
  lastTestedAt?: number
}

export type SaveTmdbKeyFailure = 'invalid_format' | 'refused' | 'offline' | 'rate_limited'

export type SaveTmdbKeyResult = { ok: true; status: TmdbStatusView } | { ok: false; reason: SaveTmdbKeyFailure }

/** Injeção para teste (mesmo molde de `syncEpg`, feature 030). */
export interface MetadataOptions {
  database?: CatalogDb
  now?: () => number
  fetchImpl?: typeof fetch
}
