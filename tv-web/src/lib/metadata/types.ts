import type { CastPerson, CatalogDb, TmdbTitleRef } from '../catalog/db'
import type { TrailerCandidate } from '../trailer/trailerCandidates'

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
  /** Elenco em texto ("A, B, C"). Com casamento no TMDB a aba Elenco mostra `castPeople` no lugar (feature 035). */
  cast?: MetadataField<string>
  /**
   * Feature 033: candidatos a trailer, já na ordem de preferência — provedor
   * primeiro, depois TMDB (`buildTrailerCandidates`). NÃO segue a regra
   * "provedor vence" dos outros campos: as duas fontes somam. Ausente quando
   * não há nenhum candidato.
   */
  trailers?: TrailerCandidate[]
  /**
   * Feature 035: resultado do casamento com o TMDB. Ausente = o TMDB ainda não
   * foi consultado para este título (sem chave, falha, ou esperando o provedor).
   */
  tmdbMatch?: 'matched' | 'no_match' | 'dead_id'
  /** Feature 035: Semelhantes do TMDB (só com `tmdbMatch === 'matched'`), na ordem do TMDB. */
  similar?: TmdbTitleRef[]
  /** Feature 035: elenco com foto/identidade do TMDB (só com `tmdbMatch === 'matched'`). */
  castPeople?: CastPerson[]
}

/** Cobertura do cruzamento de um tipo: categorias com conteúdo no aparelho × categorias declaradas (feature 035, FR-007). */
export interface KindCoverage {
  covered: number
  total: number
}

/**
 * Um título do TMDB depois do cruzamento com o catálogo local (feature 035,
 * `logic/cruzamento-local.md`). `key` = `tmdb:<kind>:<tmdbId>` — identidade
 * estável usada para restaurar o foco. `localItemId` só existe quando
 * encontrado (id local do registro em `channels`, como string).
 */
export interface ResolvedTitle extends TmdbTitleRef {
  key: string
  localItemId?: string
}

export interface TitleResolution {
  /** Encontrados primeiro, depois os não encontrados — cada grupo na ordem recebida. */
  titles: ResolvedTitle[]
  coverage: { movie?: KindCoverage; series?: KindCoverage }
}

/** Estado da aba Semelhantes (feature 035, `logic/aba-semelhantes.md` §1). */
export type SimilarTabStatus = 'loading' | 'no_key' | 'no_match' | 'unavailable' | 'empty' | 'ready'

export interface SimilarTabView {
  status: SimilarTabStatus
  titles: ResolvedTitle[]
  coverage?: KindCoverage
}

export type PersonCreditsFailure = 'no_key' | 'refused' | 'offline' | 'rate_limited' | 'not_found'

/** Página de ator (feature 035, `logic/pagina-de-ator.md`). Nunca carrega chave. */
export type PersonCreditsResult =
  | { status: 'ok'; person: { personId: number; name: string; photoUrl?: string; credits: TmdbTitleRef[] } }
  | { status: 'error'; reason: PersonCreditsFailure }

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
