import { db, type CatalogDb, type TmdbPersonRecord, type TmdbTitleRef } from '../catalog/db'
import { TmdbError, tmdbGet, tmdbImageUrl } from './tmdbConnector'
import { markTmdbState, readTmdbCredential } from './tmdbKeyRepository'
import { yearOfDate } from './tmdbMatch'
import { TMDB_CACHE_MS } from './titleMetadata'
import type { MetadataOptions, PersonCreditsResult } from './types'

/** Quantos créditos (já filtrados e ordenados) ficam guardados por pessoa — a tela mostra no máximo `FILMOGRAPHY_SHOWN_MAX`. */
export const FILMOGRAPHY_STORED_MAX = 200

/** Teto da página de ator (FR-017), encontrados primeiro. */
export const FILMOGRAPHY_SHOWN_MAX = 60

/** Gêneros de TV que são aparição, não atuação: News, Reality, Talk (`logic/pagina-de-ator.md` §3). */
const NON_ACTING_GENRES = new Set([10763, 10764, 10767])
/** Papel que é só a própria pessoa. */
const SELF_ROLE = /^(self|himself|herself|themselves|ele mesmo|ela mesma)$/i

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

interface ScoredCredit {
  ref: TmdbTitleRef
  popularity: number
}

/** `combined_credits.cast` → filmografia filtrada, sem repetir e ordenada por popularidade (D-009). */
function mapCredits(raw: unknown): TmdbTitleRef[] {
  const cast = record(raw).cast
  if (!Array.isArray(cast)) return []
  const seen = new Set<string>()
  const scored: ScoredCredit[] = []
  for (const entry of cast) {
    const item = record(entry)
    const kind = item.media_type === 'movie' ? 'movie' : item.media_type === 'tv' ? 'series' : undefined
    const id = item.id
    const title = text(item.title) ?? text(item.name)
    if (kind === undefined || typeof id !== 'number' || !Number.isFinite(id) || title === undefined) continue
    if (kind === 'series' && Array.isArray(item.genre_ids) && item.genre_ids.some((genre) => NON_ACTING_GENRES.has(genre as number))) continue
    const character = text(item.character)
    if (character !== undefined && SELF_ROLE.test(character)) continue
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)

    const ref: TmdbTitleRef = { tmdbId: id, kind, title }
    const originalTitle = text(item.original_title) ?? text(item.original_name)
    if (originalTitle !== undefined) ref.originalTitle = originalTitle
    const year = yearOfDate(item.release_date) ?? yearOfDate(item.first_air_date)
    if (year !== undefined) ref.year = year
    const poster = text(item.poster_path)
    if (poster !== undefined) ref.posterUrl = tmdbImageUrl(poster, 'w342')
    const overview = text(item.overview)
    if (overview !== undefined) ref.overview = overview
    scored.push({ ref, popularity: typeof item.popularity === 'number' ? item.popularity : 0 })
  }
  return scored
    .sort((a, b) => b.popularity - a.popularity || (b.ref.year ?? 0) - (a.ref.year ?? 0) || a.ref.tmdbId - b.ref.tmdbId)
    .slice(0, FILMOGRAPHY_STORED_MAX)
    .map((entry) => entry.ref)
}

function toResult(stored: TmdbPersonRecord): PersonCreditsResult {
  return {
    status: 'ok',
    person: { personId: stored.personId, name: stored.name, photoUrl: stored.photoUrl, credits: stored.credits },
  }
}

/** Uma obtenção por (banco, pessoa) de cada vez — chamadas concorrentes compartilham a mesma. */
const inFlight = new Map<string, Promise<PersonCreditsResult>>()

async function load(personId: number, database: CatalogDb, options: MetadataOptions): Promise<PersonCreditsResult> {
  const now = options.now?.() ?? Date.now()
  const credential = await readTmdbCredential({ database })
  if (!credential) return { status: 'error', reason: 'no_key' }
  // Só chave recusada e pausa ativa bloqueiam; `offline`/`rate_limited` vencido deixam tentar de novo.
  if (credential.state === 'refused') return { status: 'error', reason: 'refused' }
  if (credential.pausedUntil !== undefined && credential.pausedUntil > now) return { status: 'error', reason: 'rate_limited' }

  const cached = await database.tmdbPeople.get(personId)
  if (cached && now - cached.fetchedAt <= TMDB_CACHE_MS) return toResult(cached)

  try {
    const body = record(
      await tmdbGet(
        `/person/${personId}`,
        { language: 'pt-BR', append_to_response: 'combined_credits' },
        { key: credential.key, format: credential.format },
        options.fetchImpl,
      ),
    )
    const stored: TmdbPersonRecord = {
      personId,
      name: text(body.name) ?? '',
      credits: mapCredits(body.combined_credits),
      fetchedAt: now,
    }
    const photo = text(body.profile_path)
    if (photo !== undefined) stored.photoUrl = tmdbImageUrl(photo, 'w185')
    await database.tmdbPeople.put(stored)
    if (credential.state !== 'connected') await markTmdbState('connected', { database, now: () => now })
    return toResult(stored)
  } catch (error) {
    if (error instanceof TmdbError) {
      // Erro de serviço atualiza o estado exibido; nada é guardado e a chave nunca sai daqui.
      if (error.kind !== 'not_found') await markTmdbState(error.kind, { database, now: () => now })
      return { status: 'error', reason: error.kind }
    }
    return { status: 'error', reason: 'offline' }
  }
}

/**
 * Filmografia de uma pessoa (feature 035, FR-016 — `logic/pagina-de-ator.md`).
 *
 * Só é chamada quando a pessoa dá OK num ator — nunca por foco. Uma única
 * requisição (`/person/{id}?append_to_response=combined_credits`), guardada
 * com a validade do cache do TMDB (6 meses). Falha NUNCA é guardada e nunca
 * carrega a chave; sem chave → `no_key` sem requisição.
 */
export async function loadPersonCredits(personId: number, options: MetadataOptions = {}): Promise<PersonCreditsResult> {
  const database = options.database ?? db
  const key = `${database.name}|${personId}`
  const running = inFlight.get(key)
  if (running) return running
  const promise = load(personId, database, options).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, promise)
  return promise
}
