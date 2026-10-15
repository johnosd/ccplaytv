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

export interface RatedSelectionAccumulator<T> {
  add: (item: T) => void
  finish: () => { picked: T[]; eligibleCount: number }
  finishSteps: (batchSize: number) => Generator<void, { picked: T[]; eligibleCount: number }>
}

interface Candidate<T> {
  item: T
  id: string
  key: string
  rating: number
  year: number
  addedAt: number | undefined
  /** Ordem da primeira ocorrência da chave; preserva o desempate estável do Array#sort. */
  ordinal: number
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
  // Títulos ASCII simples, inclusive o ano entre parênteses, não precisam da normalização geral.
  // Só esse subconjunto entra aqui; acentos, marcadores e outros parênteses mantêm a regra completa.
  if (/^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*(?: \((?:19|20)\d{2}\))?$/.test(name)) {
    const end = name.endsWith(')') ? name.length - 7 : name.length
    const plain = name.slice(0, end).toLowerCase()
    QUALITY_WORDS.lastIndex = 0
    if (!QUALITY_WORDS.test(plain)) return plain
  }
  // A maioria dos títulos locais é ASCII e não contém marcadores. Evitamos normalização e
  // duas passagens de regex nesse caminho comum; a expressão é deliberadamente equivalente
  // ao caminho completo para entradas ASCII sem parênteses/colchetes.
  let ascii = true
  for (let index = 0; index < name.length; index += 1) {
    if (name.charCodeAt(index) > 0x7f) {
      ascii = false
      break
    }
  }
  if (ascii && !name.includes('(')) {
    let plain = name.toLowerCase()
    const marker = plain.indexOf('[')
    if (marker >= 0) {
      const close = plain.indexOf(']', marker + 1)
      if (close >= 0) plain = `${plain.slice(0, marker)} ${plain.slice(close + 1)}`
    }
    const compact = plain.trim().replace(/ +/g, ' ')
    QUALITY_WORDS.lastIndex = 0
    if (/^[a-z0-9 ]+$/.test(compact) && !QUALITY_WORDS.test(compact)) return compact
    const key = plain.replace(/\[[^\]]*\]/g, ' ').replace(QUALITY_WORDS, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
    return key !== '' ? key : plain.replace(/[^a-z0-9]+/g, ' ').trim() || name
  }
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

/** Comparador de seleção top-K: em empate total, a primeira entrada vence. */
function byStableQuality<T>(a: Candidate<T>, b: Candidate<T>): number {
  return byQuality(a, b) || a.ordinal - b.ordinal
}

/** Plano B: mais novo primeiro, depois nota e data. */
function byYearFirst<T>(a: Candidate<T>, b: Candidate<T>): number {
  if (a.year !== b.year) return b.year - a.year
  return byQuality(a, b)
}

/** Insere em uma lista já ordenada, retendo apenas os k primeiros. */
function insertTopK<T>(top: Candidate<T>[], candidate: Candidate<T>, k: number, compare: (a: Candidate<T>, b: Candidate<T>) => number): void {
  if (k <= 0) return
  if (top.length === k && compare(candidate, top[top.length - 1]) >= 0) return
  let low = 0
  let high = top.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (compare(top[middle], candidate) <= 0) low = middle + 1
    else high = middle
  }
  top.splice(low, 0, candidate)
  if (top.length > k) top.pop()
}

/**
 * Escolhe os títulos de "Bem avaliados". `eligibleCount` conta os títulos distintos elegíveis (nota 6,0–9,9 e ano conhecido,
 * uma versão por título); com menos de `min` a fileira não existe (`picked` vazio, FR-003).
 */
/** Acumulador incremental compartilhado pela API síncrona e pela variante cooperativa. */
export function createRatedSelectionAccumulator<T>(read: RatedFields<T>, options: FeaturedRatedOptions): RatedSelectionAccumulator<T> {
  const limit = options.limit ?? SHOWCASE_LIMIT
  const min = options.min ?? RATED_MIN
  const currentYear = new Date(options.now).getFullYear()

  // 1) Elegíveis, já com uma versão por título (a de maior qualidade; a primeira da entrada vence o empate total).
  const best = new Map<string, Candidate<T>>()
  let nextOrdinal = 0
  const add = (item: T): void => {
    const rating = validProviderRating(read.rating(item))
    if (rating === undefined || rating < RATED_MIN_RATING || rating >= RATED_MAX_RATING) return
    const year = usableYear(read.year(item), currentYear)
    if (year === undefined) return
    // Sem cache de nomes: com dezenas de milhares de títulos distintos, a manutenção do Map custava mais que o titleKey.
    const normalizedName = titleKey(read.name(item))
    const candidate: Candidate<T> = {
      item,
      id: read.id(item),
      key: `${normalizedName}|${year}`,
      rating,
      year,
      addedAt: finiteAddedAt(read.addedAt(item)),
      ordinal: nextOrdinal++,
    }
    const current = best.get(candidate.key)
    if (current === undefined) best.set(candidate.key, candidate)
    else if (byQuality(candidate, current) < 0) {
      // O Map mantém a posição da chave original; carregue o ordinal para que o top-K
      // continue idêntico ao sort estável da implementação de referência.
      best.set(candidate.key, { ...candidate, ordinal: current.ordinal })
    }
  }

  function* finishSteps(batchSize: number): Generator<void, { picked: T[]; eligibleCount: number }> {
    if (best.size < min || !(limit > 0)) return { picked: [], eligibleCount: best.size }

    // 2) Pool: os melhores recentes; faltando, completa com os elegíveis mais novos que existirem (plano B).
    const cutoff = currentYear - RECENT_YEARS
    const recentTop: Candidate<T>[] = []
    let count = 0
    for (const candidate of best.values()) {
      if (candidate.year >= cutoff) insertTopK(recentTop, candidate, RATED_POOL, byStableQuality)
      if (++count % batchSize === 0) yield
    }
    yield
    let pool = recentTop
    if (pool.length < limit) {
      const olderTop: Candidate<T>[] = []
      const needed = Math.trunc(limit - pool.length)
      count = 0
      for (const candidate of best.values()) {
        if (candidate.year < cutoff) insertTopK(olderTop, candidate, needed, (a, b) => byYearFirst(a, b) || a.ordinal - b.ordinal)
        if (++count % batchSize === 0) yield
      }
      pool = pool.concat(olderTop)
      yield
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

    return { picked: chosen.sort(byQuality).map((candidate) => candidate.item), eligibleCount: best.size }
  }
  const finish = (): { picked: T[]; eligibleCount: number } => {
    const steps = finishSteps(Infinity)
    let step = steps.next()
    while (!step.done) step = steps.next()
    return step.value
  }
  return { add, finish, finishSteps }
}

export function selectFeaturedRated<T>(
  items: Iterable<T>,
  read: RatedFields<T>,
  options: FeaturedRatedOptions,
): { picked: T[]; eligibleCount: number } {
  const accumulator = createRatedSelectionAccumulator(read, options)
  for (const item of items) accumulator.add(item)
  return accumulator.finish()
}

/** Dia local (`AAAA-MM-DD`) de `now` — muda uma vez por dia (FR-017). */
export function dayKey(now: number): string {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
