import type { CatalogRecord, TmdbResultRecord } from '../catalog/db'
import { TmdbError, tmdbGet, type TmdbCredential } from './tmdbConnector'
import { mapTmdbDetail, originalLanguageOf, overviewOf, type TmdbKind } from './tmdbMapping'
import { normalizeTitle, pickCandidate, yearHintFromTitle, yearOfDate, type TmdbSearchResult } from './tmdbMatch'

/**
 * Casa um filme/série do catálogo com o TMDB e devolve o resultado a guardar
 * (feature 032, D-004, `logic/metadados-e-casamento.md` §2/§3).
 *
 * Lança `TmdbError` (`refused`/`rate_limited`/`offline`) para falha de
 * serviço — quem chama NÃO grava nada nesses casos, para tentar de novo no
 * próximo detalhe aberto. `not_found` nunca sai daqui: vira `dead_id` ou
 * `no_match`, que são resultados legítimos e cacheados.
 */

export interface TmdbLookupInput {
  record: CatalogRecord
  /** `info.tmdb_id` do provedor — dica forte, nunca verdade (só filme). */
  providerTmdbId: number | undefined
  credential: TmdbCredential
  fetchImpl?: typeof fetch
}

const PT_BR = 'pt-BR'

function kindOf(record: CatalogRecord): TmdbKind {
  return record.kind === 'movie' ? 'movie' : 'tv'
}

function yearOfDetail(detail: unknown): number | undefined {
  const raw = (detail ?? {}) as Record<string, unknown>
  return yearOfDate(raw.release_date) ?? yearOfDate(raw.first_air_date)
}

/**
 * Detalhe → resultado `matched`, com o fallback de idioma (FR-021): sinopse
 * vazia em pt-BR busca a do idioma original e a marca com esse idioma. Falha
 * de serviço nessa segunda chamada sobe (nada é cacheado pela metade).
 */
async function toMatched(
  kind: TmdbKind,
  tmdbId: number,
  detail: unknown,
  input: TmdbLookupInput,
): Promise<TmdbResultRecord> {
  const fields = mapTmdbDetail(kind, detail)
  const original = originalLanguageOf(detail)
  if (fields.synopsis === undefined && original !== undefined && original !== 'pt') {
    try {
      const fallback = await tmdbGet(`/${kind}/${tmdbId}`, { language: original }, input.credential, input.fetchImpl)
      const overview = overviewOf(fallback)
      if (overview !== undefined) {
        fields.synopsis = overview
        fields.synopsisLanguage = original
      }
    } catch (error) {
      if (!(error instanceof TmdbError && error.kind === 'not_found')) throw error
    }
  }
  return { status: 'matched', tmdbId, fields }
}

export async function lookupTmdb(input: TmdbLookupInput): Promise<TmdbResultRecord> {
  const { record, providerTmdbId, credential, fetchImpl } = input
  const kind = kindOf(record)
  const year = record.year ?? yearHintFromTitle(record.originalName)
  // `include_video_language`: sem ele o TMDB só devolve vídeos em pt-BR, e quase todo trailer é `en` (D-004).
  const detailParams = {
    language: PT_BR,
    // Semelhantes e elenco com identidade vêm na MESMA chamada (035, D-001).
    append_to_response:
      kind === 'movie' ? 'credits,videos,recommendations,similar' : 'aggregate_credits,videos,recommendations,similar',
    include_video_language: 'pt,en,null',
  }

  let deadId: number | undefined
  if (providerTmdbId !== undefined) {
    try {
      const detail = await tmdbGet(`/${kind}/${providerTmdbId}`, detailParams, credential, fetchImpl)
      const detailYear = yearOfDetail(detail)
      // Ano que contradiz o do título: o id do provedor não é a mesma obra — vale a busca.
      if (year === undefined || detailYear === undefined || Math.abs(detailYear - year) <= 1) {
        return await toMatched(kind, providerTmdbId, detail, input)
      }
    } catch (error) {
      if (!(error instanceof TmdbError && error.kind === 'not_found')) throw error
      deadId = providerTmdbId
    }
  }

  const unmatched = (): TmdbResultRecord => (deadId !== undefined ? { status: 'dead_id', tmdbId: deadId } : { status: 'no_match' })

  // Sem ano não se busca por título (FR-020): nunca o "primeiro resultado".
  if (year === undefined) return unmatched()
  const query = normalizeTitle(record.originalName)
  if (query === '') return unmatched()

  const yearParam = kind === 'movie' ? 'year' : 'first_air_date_year'
  let search: { results?: TmdbSearchResult[] } | null
  try {
    search = (await tmdbGet(
      `/search/${kind}`,
      { query, language: PT_BR, [yearParam]: String(year) },
      credential,
      fetchImpl,
    )) as { results?: TmdbSearchResult[] } | null
  } catch (error) {
    // A busca do TMDB responde 200 com lista vazia; um 404 aqui é "nada encontrado", não falha de serviço.
    if (error instanceof TmdbError && error.kind === 'not_found') return unmatched()
    throw error
  }
  const candidateId = pickCandidate(Array.isArray(search?.results) ? search.results : [], query, year)
  if (candidateId === undefined) return unmatched()

  try {
    const detail = await tmdbGet(`/${kind}/${candidateId}`, detailParams, credential, fetchImpl)
    return await toMatched(kind, candidateId, detail, input)
  } catch (error) {
    if (error instanceof TmdbError && error.kind === 'not_found') return unmatched()
    throw error
  }
}
