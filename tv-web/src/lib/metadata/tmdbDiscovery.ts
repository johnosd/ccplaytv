import { db, type CatalogDb, type DiscoveryCacheRecord } from '../catalog/db'
import { readAppLanguage } from '../i18n/appLanguage'
import { APP_LANGUAGE_LOCALE } from '../i18n/languages'
import { markTmdbState, readTmdbCredential, type UsableTmdbCredential } from './tmdbKeyRepository'
import { TmdbError, tmdbGet, tmdbImageUrl } from './tmdbConnector'
import { yearOfDate } from './tmdbMatch'
import type { MetadataOptions } from './types'
import { sharedAttempt } from './sharedAttempt'

/**
 * Descoberta pelo TMDB (feature 057 — `sdd/specs/057-top10-dica-tmdb/logic/descoberta.md` §1–§2): o ranking semanal (Top 10) e o
 * conjunto de candidatos da "Dica".
 *
 * Os carregadores NUNCA lançam e NUNCA logam; a chave só passa por `tmdbGet` (feature 032). `src/lib/` não importa de
 * `src/features/` (D-014): o dia local e a semana ISO são calculados aqui mesmo.
 */

export type DiscoveryKind = 'movie' | 'series'

/** Um título do TMDB como a descoberta o guarda: só o necessário para cruzar com a lista e sortear. */
export interface DiscoveryTitle {
  tmdbId: number
  kind: DiscoveryKind
  title: string
  originalTitle?: string
  /** Ano de lançamento (`release_date`/`first_air_date`); sem ano o título nunca casa com a lista. */
  year?: number
  voteAverage: number
  voteCount: number
  popularity: number
  /** Posição real (1 = primeiro) na resposta do TMDB — no Top 10 é o número do card, sem renumerar. */
  rank: number
  /** Feature 060: imagem 16:9 (`backdrop_path`) da resposta, montada SEM chave — ausente em caches gravados antes da 060. */
  backdropUrl?: string
}

export type DiscoveryStatus = 'ok' | 'no_key' | 'unavailable'

export interface DiscoveryResult {
  status: DiscoveryStatus
  titles: DiscoveryTitle[]
  /** `true` quando o resultado veio de um cache de outro período porque a consulta falhou (FR-015). */
  stale: boolean
}

/** Quantos títulos do ranking semanal valem (as 10 primeiras posições do TMDB, FR-003). */
export const TRENDING_LIMIT = 10
/** Páginas de `discover` (20 títulos cada) que formam o conjunto de candidatos da Dica, por tipo e por dia. */
export const TIP_PAGES = 8
/** Nota média mínima do TMDB para uma Dica (FR-006). */
export const TIP_MIN_VOTE_AVERAGE = 7
/** Votos mínimos para a nota valer (FR-006) — série tem menos votos que filme. */
export const TIP_MIN_VOTES: Record<DiscoveryKind, number> = { movie: 300, series: 100 }
/** Janela de lançamento: o ano corrente e os 15 anteriores (FR-006). */
export const TIP_YEARS = 15

/** Páginas do `discover` pedidas ao mesmo tempo. */
const PAGE_BATCH = 4
const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Dia local `AAAA-MM-DD` de `now` — o período do cache da Dica (mesma saída de `dayKey` de `ratedSelection.ts`). */
function localDay(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Semana ISO local (`AAAA-Www`, segunda a domingo) de `now` — o período do cache do Top 10. */
export function weekKey(now: number): string {
  const date = new Date(now)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // A semana ISO pertence ao ano da sua quinta-feira.
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3)
  const isoYear = target.getFullYear()
  const firstThursday = new Date(isoYear, 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
  return `${isoYear}-W${pad(week)}`
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Um item de `results` → título, ou `undefined` quando falta id numérico ou título legível. */
function mapItem(raw: unknown, kind: DiscoveryKind, rank: number): DiscoveryTitle | undefined {
  const item = record(raw)
  const id = item.id
  if (typeof id !== 'number' || !Number.isFinite(id)) return undefined
  const title = kind === 'movie' ? (text(item.title) ?? text(item.name)) : (text(item.name) ?? text(item.title))
  if (title === undefined) return undefined
  const mapped: DiscoveryTitle = {
    tmdbId: id,
    kind,
    title,
    voteAverage: finite(item.vote_average),
    voteCount: finite(item.vote_count),
    popularity: finite(item.popularity),
    rank,
  }
  const original = kind === 'movie' ? (text(item.original_title) ?? text(item.original_name)) : (text(item.original_name) ?? text(item.original_title))
  if (original !== undefined) mapped.originalTitle = original
  const year = yearOfDate(kind === 'movie' ? item.release_date : item.first_air_date)
  if (year !== undefined) mapped.year = year
  const backdrop = text(item.backdrop_path)
  if (backdrop !== undefined) mapped.backdropUrl = tmdbImageUrl(backdrop, 'w780')
  return mapped
}

function mapResults(body: unknown, kind: DiscoveryKind, firstRank: number, limit: number): DiscoveryTitle[] {
  const results = record(body).results
  if (!Array.isArray(results)) return []
  const titles: DiscoveryTitle[] = []
  results.slice(0, limit).forEach((raw, index) => {
    const mapped = mapItem(raw, kind, firstRank + index)
    if (mapped) titles.push(mapped)
  })
  return titles
}

const endpoint = (kind: DiscoveryKind) => (kind === 'movie' ? 'movie' : 'tv')

async function fetchTrending(kind: DiscoveryKind, language: string, credential: UsableTmdbCredential, options: MetadataOptions): Promise<DiscoveryTitle[]> {
  const body = await tmdbGet(`/trending/${endpoint(kind)}/week`, { language }, credential, options.fetchImpl, { signal: options.signal, now: options.now })
  return mapResults(body, kind, 1, TRENDING_LIMIT)
}

async function fetchPool(kind: DiscoveryKind, language: string, now: number, credential: UsableTmdbCredential, options: MetadataOptions): Promise<DiscoveryTitle[]> {
  const since = `${new Date(now).getFullYear() - TIP_YEARS}-01-01`
  const params = (page: number): Record<string, string> => ({
    language,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_average.gte': String(TIP_MIN_VOTE_AVERAGE),
    'vote_count.gte': String(TIP_MIN_VOTES[kind]),
    [kind === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte']: since,
    page: String(page),
  })
  const path = `/discover/${endpoint(kind)}`
  // A 1ª página é obrigatória; uma falha em qualquer lote invalida a publicação inteira.
  const pages: unknown[] = [await tmdbGet(path, params(1), credential, options.fetchImpl, { signal: options.signal, now: options.now })]
  for (let start = 2; start <= TIP_PAGES; start += PAGE_BATCH) {
    const batch = Array.from({ length: Math.min(PAGE_BATCH, TIP_PAGES - start + 1) }, (_, index) => start + index)
    const settled = await Promise.allSettled(batch.map((page) => tmdbGet(path, params(page), credential, options.fetchImpl, { signal: options.signal, now: options.now })))
    const failed = settled.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
    if (failed) throw failed.reason
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') pages.push(outcome.value)
    }
  }
  const seen = new Set<number>()
  const titles: DiscoveryTitle[] = []
  for (const body of pages) {
    for (const mapped of mapResults(body, kind, titles.length + 1, Number.MAX_SAFE_INTEGER)) {
      if (seen.has(mapped.tmdbId)) continue
      seen.add(mapped.tmdbId)
      // `rank` = ordem de chegada (não é usado na Dica, mas fica coerente).
      titles.push({ ...mapped, rank: titles.length + 1 })
    }
  }
  return titles
}

type Source = 'trending' | 'pool'

async function load(source: Source, kind: DiscoveryKind, database: CatalogDb, options: MetadataOptions): Promise<DiscoveryResult> {
  const now = options.now?.() ?? Date.now()
  const credential = await readTmdbCredential({ database })
  if (!credential) return { status: 'no_key', titles: [], stale: false }

  const language = options.language ?? readAppLanguage()
  const id = `${source}:${kind}:${language}`
  const periodKey = source === 'trending' ? weekKey(now) : localDay(now)
  const cached = await database.discoveryCache.get(id)
  if (cached && cached.periodKey === periodKey) return { status: 'ok', titles: cached.titles, stale: false }

  const fallback = (): DiscoveryResult =>
    cached ? { status: 'ok', titles: cached.titles, stale: true } : { status: 'unavailable', titles: [], stale: false }
  // Só chave recusada e pausa ativa bloqueiam; `offline`/`rate_limited` vencido deixam tentar de novo.
  if (credential.state === 'refused') return fallback()
  if (credential.pausedUntil !== undefined && credential.pausedUntil > now) return fallback()

  try {
    const locale = APP_LANGUAGE_LOCALE[language]
    const titles = source === 'trending' ? await fetchTrending(kind, locale, credential, options) : await fetchPool(kind, locale, now, credential, options)
    if (titles.length === 0) return fallback()
    const current = await readTmdbCredential({ database })
    if (!current || current.revision !== credential.revision || current.key !== credential.key) return fallback()
    const stored: DiscoveryCacheRecord = { id, source, kind, language, periodKey, fetchedAt: now, titles }
    await database.discoveryCache.put(stored)
    if (credential.state !== 'connected') await markTmdbState('connected', { database, now: () => now, expectedCredentialRevision: credential.revision })
    return { status: 'ok', titles, stale: false }
  } catch (error) {
    // Erro de serviço atualiza o estado exibido; a chave e a mensagem de rede nunca saem daqui.
    if (error instanceof TmdbError && error.kind !== 'not_found') await markTmdbState(error.kind, { database, now: () => now, expectedCredentialRevision: credential.revision }, error.retryAfterMs)
    return fallback()
  }
}

/** Uma obtenção por (banco, fonte, tipo, idioma) de cada vez — chamadas concorrentes compartilham a mesma (FR-016). */
function loadOnce(source: Source, kind: DiscoveryKind, options: MetadataOptions): Promise<DiscoveryResult> {
  const database = options.database ?? db
  const key = `${database.name}|${source}|${kind}|${options.language ?? readAppLanguage()}`
  return sharedAttempt(database, key, signal => load(source, kind, database, { ...options, signal }))
    .catch((error): DiscoveryResult => {
      if (error instanceof Error && error.name === 'AbortError') throw error
      return { status: 'unavailable', titles: [], stale: false }
    })
}

/** `GET /trending/{movie|tv}/week` — as `TRENDING_LIMIT` primeiras posições; cache por semana, por tipo e por idioma. */
export async function loadWeeklyTrending(kind: DiscoveryKind, options: MetadataOptions = {}): Promise<DiscoveryResult> {
  return loadOnce('trending', kind, options)
}

/** `GET /discover/{movie|tv}` (páginas `1..TIP_PAGES`) com nota, votos e ano mínimos; cache por dia, por tipo e por idioma. */
export async function loadTipPool(kind: DiscoveryKind, options: MetadataOptions = {}): Promise<DiscoveryResult> {
  return loadOnce('pool', kind, options)
}
