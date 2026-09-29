/**
 * Casamento de um título do catálogo com o TMDB (feature 032, D-004,
 * `logic/metadados-e-casamento.md` §2). Funções puras — nenhuma rede.
 *
 * A regra é **nunca inventar**: sem ano não se busca, e só um candidato único
 * (título comparável igual, ano igual ou ±1) enriquece. Zero ou vários =
 * "sem correspondência".
 */

/** Etiquetas de qualidade/idioma que listas põem no nome e o TMDB não conhece. */
const NOISE_TOKENS = new Set(['4K', 'UHD', 'FHD', 'HD', 'SD', 'H265', 'HEVC', 'DV', 'HDR', 'LEG', 'DUB', 'DUAL', 'NAC'])

const MIN_YEAR = 1888
const MAX_YEAR = 2100

/**
 * "Duna (2021) [LEG]" → "Duna". Tira `[...]`, `(...)`, o " - AAAA" final e as
 * etiquetas isoladas; mantém acentos e maiúsculas (é o que se manda ao TMDB).
 */
export function normalizeTitle(raw: string): string {
  const withoutGroups = raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s[-–—]\s*(1[89]\d{2}|20\d{2})\s*$/, ' ')
  return withoutGroups
    .split(/\s+/)
    .filter((token) => token !== '' && !NOISE_TOKENS.has(token.toUpperCase()))
    .join(' ')
    .trim()
}

/** Forma de comparação: sem acento, minúscula, pontuação virando espaço ("Spider-Man" = "Spider Man"). */
export function comparableTitle(raw: string): string {
  return normalizeTitle(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function validYear(value: number): number | undefined {
  return Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR ? value : undefined
}

/**
 * Ano escrito no nome — "(2021)" ou " - 2021" no fim — **só para casar**;
 * nunca é exibido (constitution: ano exibido é o que a fonte declarou).
 */
export function yearHintFromTitle(raw: string): number | undefined {
  const parenthesized = /\((1[89]\d{2}|20\d{2})\)/.exec(raw)
  if (parenthesized) return validYear(Number(parenthesized[1]))
  const trailing = /\s[-–—]\s*(1[89]\d{2}|20\d{2})\s*$/.exec(raw)
  return trailing ? validYear(Number(trailing[1])) : undefined
}

/** `"1999-03-31"` → `1999`; qualquer outra forma → `undefined`. */
export function yearOfDate(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4})/.exec(value.trim())
  return match ? validYear(Number(match[1])) : undefined
}

export interface TmdbSearchResult {
  id?: unknown
  title?: unknown
  name?: unknown
  original_title?: unknown
  original_name?: unknown
  release_date?: unknown
  first_air_date?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * O único candidato plausível, ou `undefined` (zero **ou** vários). Plausível
 * = tem data, ano igual ou ±1, e o título (ou o título original) é igual ao
 * pesquisado depois de normalizado.
 */
export function pickCandidate(results: readonly TmdbSearchResult[], query: string, year: number): number | undefined {
  const wanted = comparableTitle(query)
  if (wanted === '') return undefined
  const plausible = results.filter((candidate) => {
    if (typeof candidate.id !== 'number') return false
    const candidateYear = yearOfDate(candidate.release_date) ?? yearOfDate(candidate.first_air_date)
    if (candidateYear === undefined || Math.abs(candidateYear - year) > 1) return false
    const titles = [candidate.title, candidate.name, candidate.original_title, candidate.original_name].map((value) =>
      comparableTitle(text(value)),
    )
    return titles.includes(wanted)
  })
  return plausible.length === 1 ? (plausible[0].id as number) : undefined
}
