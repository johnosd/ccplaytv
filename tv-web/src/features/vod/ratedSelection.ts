import { compareByRating, finiteAddedAt, RATED_MIN, SHOWCASE_LIMIT, validProviderRating } from './vodShowcase'

/**
 * Seleção da fileira "Bem avaliados" (feature 056, refinamento de 2026-10-04, FR-015..FR-018): recente, de boa nota, sem
 * versões duplicadas e variada de um dia para o outro. Puro: o relógio e a semente entram por parâmetro. Regras em
 * `sdd/specs/056-bem-avaliados/logic/bem-avaliados.md` §7.
 */

/** Piso da nota (inclusivo) — abaixo disso não é "bem avaliado". */
export const RATED_MIN_RATING = 6
/** Teto da nota (exclusivo): o 10,0 do provedor é quase sempre de 1–2 votos. */
export const RATED_MAX_RATING = 10
/** Janela de "recente": o ano corrente e os 10 anteriores. */
export const RECENT_YEARS = 10
/** Os melhores candidatos recentes entre os quais se sorteia (3 × o limite da fileira). */
export const RATED_POOL = 36

export interface RatedFields<T> {
  id: (item: T) => string
  name: (item: T) => string
  rating: (item: T) => unknown
  year: (item: T) => unknown
  addedAt: (item: T) => unknown
}

export interface FeaturedRatedOptions {
  /** Instante atual (ms) — define o ano corrente. */
  now: number
  /** Semente do sorteio (ex.: dia local + tipo + lista): mesma semente e mesmos dados ⇒ mesma escolha. */
  seed: string
  limit?: number
  min?: number
}

interface Candidate<T> {
  item: T
  id: string
  key: string
  rating: number
  year: number
  addedAt: number | undefined
}

/** FNV-1a de 32 bits — hash barato e estável para o sorteio. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const QUALITY_WORDS = /\b(?:4k|uhd|fhd|hd|sd|hdr|dual|dublado|dub|legendado|leg|1080p|720p|2160p)\b/g

/**
 * Chave de "mesmo título": sem acento, minúsculas, sem `[...]` (ex.: `[L]`), sem `(...)` que seja só qualidade/idioma/ano e
 * sem palavras soltas de qualidade. Versões do mesmo filme (mesmo ano) caem na mesma chave (FR-018).
 */
export function titleKey(name: string): string {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const key = plain
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(([^)]*)\)/g, (whole, inner: string) => {
      const rest = inner.replace(QUALITY_WORDS, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
      return rest === '' || /^(?:19|20)\d{2}$/.test(rest) ? ' ' : whole
    })
    .replace(QUALITY_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return key !== '' ? key : plain.replace(/[^a-z0-9]+/g, ' ').trim() || name
}

/** Ano inteiro utilizável (1888 até o ano corrente + 1) ou `undefined`. */
function usableYear(value: unknown, currentYear: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1888 && value <= currentYear + 1 ? value : undefined
}

/** Qualidade: nota ↓, ano ↓, adicionado mais recentemente ↓ (sem data depois). */
function byQuality<T>(a: Candidate<T>, b: Candidate<T>): number {
  if (a.rating !== b.rating) return b.rating - a.rating
  if (a.year !== b.year) return b.year - a.year
  return compareByRating(a, b)
}

/** Plano B: mais novo primeiro, depois nota e data. */
function byYearFirst<T>(a: Candidate<T>, b: Candidate<T>): number {
  if (a.year !== b.year) return b.year - a.year
  return byQuality(a, b)
}

/**
 * Escolhe os títulos de "Bem avaliados". `eligibleCount` conta os títulos distintos elegíveis (nota 6,0–9,9 e ano conhecido,
 * uma versão por título); com menos de `min` a fileira não existe (`picked` vazio, FR-003).
 */
export function selectFeaturedRated<T>(
  items: Iterable<T>,
  read: RatedFields<T>,
  options: FeaturedRatedOptions,
): { picked: T[]; eligibleCount: number } {
  const limit = options.limit ?? SHOWCASE_LIMIT
  const min = options.min ?? RATED_MIN
  const currentYear = new Date(options.now).getFullYear()

  // 1) Elegíveis, já com uma versão por título (a de maior qualidade; a primeira da entrada vence o empate total).
  const best = new Map<string, Candidate<T>>()
  for (const item of items) {
    const rating = validProviderRating(read.rating(item))
    if (rating === undefined || rating < RATED_MIN_RATING || rating >= RATED_MAX_RATING) continue
    const year = usableYear(read.year(item), currentYear)
    if (year === undefined) continue
    const candidate: Candidate<T> = {
      item,
      id: read.id(item),
      key: `${titleKey(read.name(item))}|${year}`,
      rating,
      year,
      addedAt: finiteAddedAt(read.addedAt(item)),
    }
    const current = best.get(candidate.key)
    if (current === undefined || byQuality(candidate, current) < 0) best.set(candidate.key, candidate)
  }
  const unique = [...best.values()]
  if (unique.length < min || !(limit > 0)) return { picked: [], eligibleCount: unique.length }

  // 2) Pool: os melhores recentes; faltando, completa com os elegíveis mais novos que existirem (plano B).
  const cutoff = currentYear - RECENT_YEARS
  let pool = unique.filter((candidate) => candidate.year >= cutoff).sort(byQuality).slice(0, RATED_POOL)
  if (pool.length < limit) {
    const older = unique.filter((candidate) => candidate.year < cutoff).sort(byYearFirst)
    pool = pool.concat(older.slice(0, limit - pool.length))
  }

  // 3) Sorteio estável por hash: mesma semente + mesmos dados ⇒ mesma escolha; um candidato novo só entra se o hash dele
  //    for menor que o de algum escolhido.
  let chosen = pool
  if (pool.length > limit) {
    chosen = pool
      .map((candidate) => ({ candidate, hash: fnv1a32(`${options.seed}|${candidate.id}`) }))
      .sort((a, b) => a.hash - b.hash || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0))
      .slice(0, limit)
      .map((entry) => entry.candidate)
  }

  return { picked: chosen.sort(byQuality).map((candidate) => candidate.item), eligibleCount: unique.length }
}

/** Dia local (`AAAA-MM-DD`) de `now` — muda uma vez por dia (FR-017). */
export function dayKey(now: number): string {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
