import type { CatalogRecord, TmdbResultRecord } from '../catalog/db'
import { APP_LANGUAGE_LOCALE, type AppLanguage } from '../i18n/languages'
import { TmdbError, tmdbGet, type TmdbCredential } from './tmdbConnector'
import { mapTmdbDetail, originalLanguageOf, overviewOf, type TmdbKind } from './tmdbMapping'
import { normalizeTitle, pickCandidate, yearHintFromTitle, yearOfDate, type TmdbSearchResult } from './tmdbMatch'
import { trailerRefsFromTmdbVideos } from '../trailer/trailerCandidates'

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
  /** Idioma do app (feature 054): sinopse, gêneros e papéis vêm nele; sem valor, português (comportamento anterior). */
  language?: AppLanguage
  /** Idioma preferido dos vídeos (`en`, `es`…): entra no `include_video_language`. Sem valor, o `language`. */
  preferredLanguage?: string
  signal?: AbortSignal
  now?: () => number
}

/**
 * Idiomas de vídeo pedidos ao TMDB: o do app COM região (`pt-BR` — só `pt` o TMDB lê como pt-PT, e os brasileiros não
 * vinham), pt e en de sempre, o preferido da pessoa e os sem idioma. A ordem final é de `buildTrailerCandidates`.
 */
function videoLanguages(language: AppLanguage, preferred: string | undefined): string[] {
  return [...new Set([APP_LANGUAGE_LOCALE[language], 'pt', 'en', ...(preferred ? [preferred] : []), 'null'])]
}

function kindOf(record: CatalogRecord): TmdbKind {
  return record.kind === 'movie' ? 'movie' : 'tv'
}

function yearOfDetail(detail: unknown): number | undefined {
  const raw = (detail ?? {}) as Record<string, unknown>
  return yearOfDate(raw.release_date) ?? yearOfDate(raw.first_air_date)
}

/**
 * Detalhe → resultado `matched`, com a cadeia de idioma da sinopse (FR-021;
 * 054, `logic/idioma-do-app.md` §4): idioma do app → `en-US` → idioma original.
 * O passo seguinte só roda se o anterior veio vazio, e nada roda quando o
 * original já é o idioma do app (repetir a chamada devolveria o mesmo vazio). A
 * sinopse que NÃO está no idioma do app leva o código ISO do idioma em que veio.
 * Falha de serviço num passo sobe (nada é cacheado pela metade).
 */
async function toMatched(
  kind: TmdbKind,
  tmdbId: number,
  detail: unknown,
  input: TmdbLookupInput,
): Promise<TmdbResultRecord> {
  const language = input.language ?? 'pt'
  const fields = mapTmdbDetail(kind, detail, language)
  const original = originalLanguageOf(detail)
  if (fields.synopsis === undefined && original !== undefined && original !== language) {
    const chain: { locale: string; iso: string }[] = []
    if (language !== 'en') chain.push({ locale: 'en-US', iso: 'en' })
    if (original !== 'en') chain.push({ locale: original, iso: original })
    for (const step of chain) {
      try {
        const fallback = await tmdbGet(`/${kind}/${tmdbId}`, { language: step.locale }, input.credential, input.fetchImpl, { signal: input.signal, now: input.now })
        const overview = overviewOf(fallback)
        if (overview !== undefined) {
          fields.synopsis = overview
          fields.synopsisLanguage = step.iso
          break
        }
      } catch (error) {
        if (!(error instanceof TmdbError && error.kind === 'not_found')) throw error
      }
    }
  }
  // Nenhum trailer nos idiomas pedidos: tenta o idioma original (filme coreano com trailer só em `ko`). Uma chamada a
  // mais só nesse caso; `/videos` sem idioma devolveria só en-US, por isso o original vai explícito.
  const requested = videoLanguages(language, input.preferredLanguage ?? input.language)
  if (fields.trailerVideos?.length === 0 && original !== undefined && !requested.includes(original)) {
    try {
      const videos = await tmdbGet(`/${kind}/${tmdbId}/videos`, { include_video_language: original }, input.credential, input.fetchImpl, { signal: input.signal, now: input.now })
      fields.trailerVideos = trailerRefsFromTmdbVideos(videos)
    } catch (error) {
      if (!(error instanceof TmdbError && error.kind === 'not_found')) throw error
    }
  }
  return { status: 'matched', tmdbId, fields, language }
}

export async function lookupTmdb(input: TmdbLookupInput): Promise<TmdbResultRecord> {
  const { record, providerTmdbId, credential, fetchImpl } = input
  const kind = kindOf(record)
  const year = record.year ?? yearHintFromTitle(record.originalName)
  const locale = APP_LANGUAGE_LOCALE[input.language ?? 'pt']
  // `include_video_language`: sem ele o TMDB só devolve vídeos em pt-BR, e quase todo trailer é `en` (D-004).
  const detailParams = {
    language: locale,
    // Semelhantes e elenco com identidade vêm na MESMA chamada (035, D-001).
    append_to_response:
      kind === 'movie' ? 'credits,videos,recommendations,similar,release_dates' : 'aggregate_credits,videos,recommendations,similar,content_ratings',
    include_video_language: videoLanguages(input.language ?? 'pt', input.preferredLanguage ?? input.language).join(','),
  }

  let deadId: number | undefined
  if (providerTmdbId !== undefined) {
    try {
      const detail = await tmdbGet(`/${kind}/${providerTmdbId}`, detailParams, credential, fetchImpl, { signal: input.signal, now: input.now })
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
      { query, language: locale, [yearParam]: String(year) },
      credential,
      fetchImpl,
      { signal: input.signal, now: input.now },
    )) as { results?: TmdbSearchResult[] } | null
  } catch (error) {
    // A busca do TMDB responde 200 com lista vazia; um 404 aqui é "nada encontrado", não falha de serviço.
    if (error instanceof TmdbError && error.kind === 'not_found') return unmatched()
    throw error
  }
  const candidateId = pickCandidate(Array.isArray(search?.results) ? search.results : [], query, year)
  if (candidateId === undefined) return unmatched()

  try {
    const detail = await tmdbGet(`/${kind}/${candidateId}`, detailParams, credential, fetchImpl, { signal: input.signal, now: input.now })
    return await toMatched(kind, candidateId, detail, input)
  } catch (error) {
    if (error instanceof TmdbError && error.kind === 'not_found') return unmatched()
    throw error
  }
}
