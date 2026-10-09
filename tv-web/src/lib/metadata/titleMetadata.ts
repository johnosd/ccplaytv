import {
  db,
  type CatalogDb,
  type CatalogRecord,
  type TitleFields,
  type TitleMetadataRecord,
  type TmdbResultRecord,
} from '../catalog/db'
import { getCategory, getChannel } from '../catalog/catalogRepository'
import { isCategoryFresh } from '../catalog/freshness'
import { isAppHidden } from '../network/networkState'
import { readCredential } from '../catalog/sourceRepository'
import { fetchSeriesDetail, fetchVodInfo } from '../catalog/xtreamConnector'
import { normalizeSeriesInfo, normalizeVodInfo } from './providerMetadata'
import { lookupTmdb } from './tmdbLookup'
import { TmdbError } from './tmdbConnector'
import { markTmdbState, readTmdbCredential } from './tmdbKeyRepository'
import { readAppLanguage } from '../i18n/appLanguage'
import type { AppLanguage } from '../i18n/languages'
import { buildTrailerCandidates } from '../trailer/trailerCandidates'
import { PROVIDER_FIELDS_VERSION, storeProviderMetadata, storeTmdbResult, titleStableId } from './titleMetadataStore'
import type { MetadataOptions, TitleMetadataView } from './types'
import { sharedAttempt } from './sharedAttempt'

/** Validade do que veio do TMDB — 6 meses (termos do TMDB, FR-023), inclusive "sem correspondência" e "id morto". */
export const TMDB_CACHE_MS = 182 * 24 * 60 * 60 * 1000

/** `matched` gravado antes da 033 não tem a chave `trailerVideos` (D-005) — repete-se uma vez. */
function tmdbLacksVideos(tmdb: TmdbResultRecord | undefined): boolean {
  return tmdb?.status === 'matched' && tmdb.fields.trailerVideos === undefined
}

/** `matched` gravado antes da 035 não tem a chave `similar` (D-003) — repete-se uma vez. */
function tmdbLacks035(tmdb: TmdbResultRecord | undefined): boolean {
  return tmdb?.status === 'matched' && tmdb.fields.similar === undefined
}

/** `matched` anterior à 061 não tem `certifications` — repete-se uma vez ao abrir (FR-014). */
function tmdbLacks061(tmdb: TmdbResultRecord | undefined): boolean {
  return tmdb?.status === 'matched' && tmdb.fields.certifications === undefined
}

/** `matched` buscado em outro idioma que não o do app (feature 054); ausente = português, como antes da 054. */
function tmdbInOtherLanguage(tmdb: TmdbResultRecord | undefined, language: AppLanguage): boolean {
  return tmdb?.status === 'matched' && (tmdb.language ?? 'pt') !== language
}

/**
 * Mescla, campo a campo, o que o provedor declarou com o que o TMDB devolveu
 * (feature 032, D-003, `logic/metadados-e-casamento.md` §4): o provedor
 * SEMPRE vence; o TMDB só preenche o que está vazio. A mescla é feita na
 * leitura — o registro do TMDB é guardado inteiro. Só é lido o que existe;
 * campo ausente nas duas fontes fica ausente.
 */
export function mergeTitleMetadata(
  provider: TitleFields | undefined,
  tmdb: TmdbResultRecord | undefined,
  preferredLanguage?: string,
): TitleMetadataView {
  const fromTmdb: TitleFields = tmdb?.status === 'matched' ? tmdb.fields : {}
  const view: TitleMetadataView = {}

  if (provider?.synopsis !== undefined) {
    view.synopsis = { value: provider.synopsis, origin: 'provider' }
  } else if (fromTmdb.synopsis !== undefined) {
    view.synopsis = { value: fromTmdb.synopsis, origin: 'tmdb' }
    if (fromTmdb.synopsisLanguage !== undefined) view.synopsis.language = fromTmdb.synopsisLanguage
  }

  const backdropUrl = provider?.backdropUrl ?? fromTmdb.backdropUrl
  if (backdropUrl !== undefined) {
    view.backdropUrl = { value: backdropUrl, origin: provider?.backdropUrl !== undefined ? 'provider' : 'tmdb' }
  }
  const genres = provider?.genres ?? fromTmdb.genres
  if (genres !== undefined) view.genres = { value: genres, origin: provider?.genres !== undefined ? 'provider' : 'tmdb' }
  const durationSeconds = provider?.durationSeconds ?? fromTmdb.durationSeconds
  if (durationSeconds !== undefined) {
    view.durationSeconds = { value: durationSeconds, origin: provider?.durationSeconds !== undefined ? 'provider' : 'tmdb' }
  }
  const director = provider?.director ?? fromTmdb.director
  if (director !== undefined) view.director = { value: director, origin: provider?.director !== undefined ? 'provider' : 'tmdb' }
  const country = provider?.country ?? fromTmdb.country
  if (country !== undefined) view.country = { value: country, origin: provider?.country !== undefined ? 'provider' : 'tmdb' }
  const cast = provider?.cast ?? fromTmdb.cast
  if (cast !== undefined) view.cast = { value: cast, origin: provider?.cast !== undefined ? 'provider' : 'tmdb' }

  // Único campo em que as duas fontes SOMAM (provedor primeiro), em vez de "provedor vence".
  const trailers = buildTrailerCandidates(provider?.trailerVideos, fromTmdb.trailerVideos, preferredLanguage)
  if (trailers.length > 0) view.trailers = trailers

  // Feature 035: Semelhantes e elenco com identidade existem só no TMDB.
  if (tmdb) view.tmdbMatch = tmdb.status
  if (tmdb?.status === 'matched') {
    if (tmdb.fields.certifications !== undefined) view.certifications = tmdb.fields.certifications
    if (tmdb.fields.tmdbRating !== undefined) view.tmdbRating = tmdb.fields.tmdbRating
    if (tmdb.fields.similar !== undefined) view.similar = tmdb.fields.similar
    if (tmdb.fields.castPeople?.length) view.castPeople = tmdb.fields.castPeople
  }

  return view
}

/**
 * Obtenção em andamento por título — chamadas concorrentes compartilham UMA
 * só (FR-025). A chave inclui o nome do banco: os testes usam um banco por caso.
 */
const latestLanguageByTitle = new Map<string, string>()
/**
 * Busca o que o provedor declarou para o título — `get_vod_info` (filme) ou
 * `get_series_info` (série) —, se o cache do provedor estiver vencido (24 h).
 * Devolve o que deve ser gravado ou `undefined` quando não há o que fazer
 * (cache fresco, fonte sem protocolo, série cujos episódios já vieram na
 * importação). **Nunca lança**: falha do provedor não avança a validade e o
 * detalhe segue com o que já havia (FR-006).
 */
async function refreshFromProvider(
  record: CatalogRecord,
  cached: TitleMetadataRecord | undefined,
  database: CatalogDb,
  now: number,
  fetchImpl: typeof fetch | undefined,
): Promise<{ fields: TitleFields; tmdbId: number | undefined } | 'deferred' | undefined> {
  // Versão antiga do conjunto de campos conta como vencida (D-006).
  if (isCategoryFresh(cached?.providerFetchedAt, now) && cached?.providerVersion === PROVIDER_FIELDS_VERSION) {
    return undefined
  }
  try {
    const credential = await readCredential(record.sourceId, database)
    if (!credential) return undefined

    if (record.kind === 'movie') {
      // Sem id do painel (fonte M3U avulsa) não há como perguntar ao provedor.
      if (!record.providerStreamId) return undefined
      const info = await fetchVodInfo(
        credential.dns,
        credential.username,
        credential.password,
        record.providerStreamId,
        undefined,
        fetchImpl,
      )
      const normalized = normalizeVodInfo(info)
      return { fields: normalized.fields, tmdbId: normalized.tmdbId }
    }

    // Série: só a de categoria `on_demand` fala o protocolo (M3U `eager`/`stored`
    // tem `seriesId` sintético — `m3u:…` — que o painel não conhece).
    if (!record.seriesId) return undefined
    const category = record.categoryId !== undefined ? await getCategory(record.categoryId, database) : undefined
    if (category?.fetchMode !== 'on_demand') return undefined
    // Quem busca a série é o `seriesLoader` (episódios + `info` na MESMA
    // resposta, D-009) e ele grava a metadata ao terminar — a tela relê ao fim
    // (`useSeriesEpisodes` invalida `title-metadata`). Perguntar aqui também,
    // enquanto os episódios ainda vão ser buscados, duplicaria a requisição
    // toda vez que uma série é aberta pela primeira vez. Só se pergunta sozinho
    // quando os episódios já estão frescos e a metadata não (série aberta antes
    // desta feature, R-004): uma vez.
    if (!isCategoryFresh(record.episodesFetchedAt, now)) return 'deferred'
    const detail = await fetchSeriesDetail(
      credential.dns,
      credential.username,
      credential.password,
      record.seriesId,
      fetchImpl,
    )
    return { fields: normalizeSeriesInfo(detail.info).fields, tmdbId: undefined }
  } catch {
    return undefined
  }
}

/**
 * Consulta o TMDB para preencher lacunas e guarda o resultado (FR-018/FR-023).
 * **Nunca lança**: erro de serviço atualiza o estado em Integrações/dock e
 * NÃO é cacheado — o próximo detalhe aberto tenta de novo, nunca em laço
 * (D-005). Chave recusada para de tentar até uma chave nova.
 */
async function enrichFromTmdb(
  record: CatalogRecord,
  database: CatalogDb,
  now: number,
  options: MetadataOptions,
): Promise<TmdbResultRecord | undefined> {
  try {
    const language = options.language ?? readAppLanguage()
    const cached = await database.titleMetadata.get(titleStableId(record) ?? '')
    // D-002 (035): com chave, o TMDB é consultado mesmo com o provedor completo — Semelhantes e fotos só existem lá.
    const lacksNewFields = tmdbLacksVideos(cached?.tmdb) || tmdbLacks035(cached?.tmdb) || tmdbLacks061(cached?.tmdb)
    // 054: o que foi buscado em outro idioma vale como vencido ao ABRIR o detalhe (`no_match`/`dead_id` não dependem do idioma).
    const stale = tmdbInOtherLanguage(cached?.tmdb, language)
    if (!lacksNewFields && !stale && cached?.tmdbFetchedAt !== undefined && now - cached.tmdbFetchedAt <= TMDB_CACHE_MS) return

    const credential = await readTmdbCredential({ database })
    if (!credential || credential.state === 'refused') return
    if (credential.pausedUntil !== undefined && credential.pausedUntil > now) return

    try {
      const result = await lookupTmdb({
        record,
        providerTmdbId: cached?.providerTmdbId ?? (cached?.tmdb?.status === 'matched' ? cached.tmdb.tmdbId : undefined),
        credential: { key: credential.key, format: credential.format },
        fetchImpl: options.fetchImpl,
        language,
        preferredLanguage: language,
        signal: options.signal,
        now: options.now,
      })
      const contextKey = `${database.name}|${titleStableId(record) ?? record.id}`
      const currentCredential = await readTmdbCredential({ database })
      const source = await database.sources.get(record.sourceId)
      if (
        latestLanguageByTitle.get(contextKey) !== language ||
        !currentCredential ||
        currentCredential.key !== credential.key ||
        currentCredential.revision !== credential.revision ||
        !source ||
        source.activeGeneration !== record.generation
      ) return result
      await storeTmdbResult(database, record, result, now)
      // Uma chamada que deu certo desfaz "sem conexão"/"limite de uso" no estado exibido.
      if (credential.state !== 'connected') await markTmdbState('connected', { database, now: () => now, expectedCredentialRevision: credential.revision })
    } catch (error) {
      if (error instanceof TmdbError && error.kind !== 'not_found') {
        await markTmdbState(error.kind, { database, now: () => now, expectedCredentialRevision: credential.revision }, error.retryAfterMs)
      }
    }
  } catch {
    // Nunca derruba o detalhe (FR-006).
  }
}

async function ensure(record: CatalogRecord, stableId: string, options: MetadataOptions): Promise<TitleMetadataView> {
  const database = options.database ?? db
  const now = options.now?.() ?? Date.now()

  const cached = await database.titleMetadata.get(stableId)

  const fresh = await refreshFromProvider(record, cached, database, now, options.fetchImpl)
  if (fresh && fresh !== 'deferred') {
    await storeProviderMetadata(database, record, fresh.fields, fresh.tmdbId, now)
  }

  // Provedor ainda por vir (o `seriesLoader` vai gravá-lo): o TMDB só completa
  // o que o provedor NÃO trouxe — sem saber o que ele trouxe, esperar evita
  // uma chamada à toa. A tela relê quando o provedor gravar.
  // Feature 042 (D-009, FR-005): com o app oculto nenhuma busca BYOK/TMDB começa
  // — nada é gravado (nem "sem correspondência"); o próximo abrir do detalhe pede.
  let transientTmdb: TmdbResultRecord | undefined
  if (fresh !== 'deferred' && !isAppHidden()) transientTmdb = await enrichFromTmdb(record, database, now, options)

  if (transientTmdb !== undefined) {
    const storedProvider = await database.titleMetadata.get(stableId)
    return mergeTitleMetadata(storedProvider?.provider, transientTmdb, options.language ?? readAppLanguage())
  }

  const stored = await database.titleMetadata.get(stableId)
  // O idioma preferido só reordena os trailers já guardados — mudar a preferência não refaz consulta.
  return mergeTitleMetadata(stored?.provider, stored?.tmdb, options.language ?? readAppLanguage())
}

/**
 * Obtém (ou lê do cache) a metadata de um filme/série e devolve a visão já
 * mesclada, com a origem de cada campo (feature 032, US1/US3 —
 * `logic/metadados-e-casamento.md`).
 *
 * Só é chamada ao ABRIR o detalhe (FR-002/D-002), nunca por foco nem em lote.
 * Nunca lança por falha de rede/provedor (FR-006): devolve o que houver.
 *
 * @param itemId id local do registro `kind: 'movie' | 'series'` em `channels`.
 */
export async function ensureTitleMetadata(itemId: number, options: MetadataOptions = {}): Promise<TitleMetadataView> {
  const database = options.database ?? db
  try {
    const record = await getChannel(itemId, database)
    if (!record || (record.kind !== 'movie' && record.kind !== 'series')) return {}
    const stableId = titleStableId(record)
    if (stableId === null) return {}

    // O idioma entra na chave: duas aberturas em idiomas diferentes não compartilham a mesma obtenção (054).
    const language = options.language ?? readAppLanguage()
    const contextKey = `${database.name}|${stableId}`
    latestLanguageByTitle.set(contextKey, language)
    const key = `${contextKey}|${language}`
    return await sharedAttempt(database, key, signal => ensure(record, stableId, { ...options, signal }), options.signal)
  } catch {
    return {}
  }
}
