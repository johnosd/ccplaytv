import { comparableTitle, yearHintFromTitle } from './tmdbMatch'
import { TIP_MIN_VOTE_AVERAGE, TIP_MIN_VOTES, TIP_YEARS, type DiscoveryTitle } from './tmdbDiscovery'

/**
 * Regras puras da descoberta (feature 057 — `sdd/specs/057-top10-dica-tmdb/logic/descoberta.md` §3–§5): cruzar os títulos do
 * TMDB com a lista, escolher a versão, montar o Top 10 e sortear a Dica. Sem rede, sem relógio global (`now` e `seed` entram por
 * parâmetro). `src/lib/` não importa de `src/features/` (D-014): hash e réguas de nota/data são locais, iguais aos da 056.
 */

/** Menos que isto de títulos cruzados e o Top 10 não existe (FR-004). */
export const TOP10_MIN = 3
/** Menos que isto de candidatos válidos e a Dica não existe (FR-008). */
export const TIP_MIN = 5
/** Tamanho máximo das duas fileiras (FR-003, FR-005). */
export const DISCOVERY_LIMIT = 10

/** Como ler um registro da lista (o `T` é o que o chamador já tem: entrada do índice de busca, item de teste...). */
export interface LocalTitleFields<T> {
  id: (item: T) => string
  /** Nome como a fonte declarou (com `[L]`, `4K`, `(2021)`...). */
  name: (item: T) => string
  year: (item: T) => unknown
  rating: (item: T) => unknown
  addedAt: (item: T) => unknown
}

export interface MatchedTitle<T> {
  title: DiscoveryTitle
  local: T
}

/** FNV-1a de 32 bits — hash barato e estável para o sorteio (mesmo algoritmo de `ratedSelection.ts`). */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Nota do provedor válida (0 < n ≤ 10, finita) ou `undefined`. */
function validRating(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10 ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const NON_PRINCIPAL = /\[\s*(?:l|leg|legendado)\s*\]|\(\s*(?:leg|legendado)\s*\)|\blegendado\b|\b(?:4k|uhd|2160p)\b/i

/** Versão principal = 0; 4K ou legendada (`[L]`, `[LEG]`, `Legendado`, `4K`, `UHD`, `2160p`) = 1 (FR-011). */
export function versionTier(name: string): 0 | 1 {
  return NON_PRINCIPAL.test(name) ? 1 : 0
}

/** Marcadores de idioma soltos que `normalizeTitle` não conhece. */
const LANGUAGE_WORDS = /\b(?:legendado|dublado)\b/gi

function titleKey(name: string): string {
  return comparableTitle(name.replace(LANGUAGE_WORDS, ' '))
}

interface LocalCopy<T> {
  item: T
  /** Chave do título comparável + ano a que a cópia pertence. */
  key: string
  order: number
  tier: 0 | 1
  rating: number | undefined
  addedAt: number | undefined
}

/** Melhor cópia primeiro: menor versão, maior nota, adicionada mais recente, primeira da entrada. */
function compareCopies<T>(a: LocalCopy<T>, b: LocalCopy<T>): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.rating !== b.rating) {
    if (a.rating === undefined) return 1
    if (b.rating === undefined) return -1
    return b.rating - a.rating
  }
  if (a.addedAt !== b.addedAt) {
    if (a.addedAt === undefined) return 1
    if (b.addedAt === undefined) return -1
    return b.addedAt - a.addedAt
  }
  return a.order - b.order
}

/** Chave local por registro (título comparável + ano) — memoizada: o índice tem dezenas de milhares de registros. */
const localKeyMemo = new WeakMap<object, string | null>()

type ByKey<T> = Map<string, LocalCopy<T>[]>

/**
 * Indexa os registros da lista por título comparável + ano. É um gerador que "pausa" a cada `sliceSize` registros: a versão
 * síncrona o consome de uma vez (sliceSize infinito) e a assíncrona cede a thread entre as fatias.
 */
function* indexLocals<T>(locals: Iterable<T>, read: LocalTitleFields<T>, sliceSize: number): Generator<void, ByKey<T>, void> {
  const byKey: ByKey<T> = new Map()
  let order = 0
  for (const item of locals) {
    order += 1
    let key: string | null | undefined = typeof item === 'object' && item !== null ? localKeyMemo.get(item) : undefined
    if (key === undefined) {
      const name = read.name(item)
      const rawYear = read.year(item)
      const year = typeof rawYear === 'number' && Number.isInteger(rawYear) ? rawYear : yearHintFromTitle(name)
      const comparable = titleKey(name)
      key = year === undefined || comparable === '' ? null : `${comparable}|${year}`
      if (typeof item === 'object' && item !== null) localKeyMemo.set(item, key)
    }
    if (key !== null) {
      const copy: LocalCopy<T> = {
        item,
        key,
        order,
        tier: versionTier(read.name(item)),
        rating: validRating(read.rating(item)),
        addedAt: finiteNumber(read.addedAt(item)),
      }
      const list = byKey.get(key)
      if (list) list.push(copy)
      else byKey.set(key, [copy])
    }
    if (order % sliceSize === 0) yield
  }
  for (const list of byKey.values()) list.sort(compareCopies)
  return byKey
}

/** Casa os títulos do TMDB com o índice já montado: um título da lista serve a um título do TMDB só. */
function pickMatches<T>(titles: readonly DiscoveryTitle[], byKey: ByKey<T>): MatchedTitle<T>[] {
  // Um título da lista (mesma chave) serve a um título do TMDB só: o segundo que cair nele fica de fora, não pega outra cópia.
  const used = new Set<string>()
  const matches: MatchedTitle<T>[] = []
  for (const title of titles) {
    if (title.year === undefined) continue
    const keys = new Set<string>()
    for (const text of [title.title, title.originalTitle]) {
      const comparable = titleKey(text ?? '')
      if (comparable !== '') keys.add(`${comparable}|${title.year}`)
    }
    const candidates: LocalCopy<T>[] = []
    for (const key of keys) candidates.push(...(byKey.get(key) ?? []))
    candidates.sort(compareCopies)
    const chosen = candidates[0]
    if (!chosen || used.has(chosen.key)) continue
    used.add(chosen.key)
    matches.push({ title, local: chosen.item })
  }
  return matches
}

/**
 * Cruza títulos do TMDB (todos do mesmo tipo da lista) com os registros da lista: mesmo título comparável (`title` ou
 * `originalTitle`) e **mesmo ano** (`year` do registro, ou o escrito no nome); entre as cópias, a de menor `versionTier`, depois
 * maior nota, depois adicionada mais recentemente, depois a primeira da entrada. Um registro nunca serve a dois títulos do TMDB.
 * Devolve na ordem recebida (`rank` crescente no ranking).
 */
export function matchDiscoveryTitles<T>(
  titles: readonly DiscoveryTitle[],
  locals: Iterable<T>,
  read: LocalTitleFields<T>,
): MatchedTitle<T>[] {
  if (titles.length === 0) return []
  const steps = indexLocals(locals, read, Number.POSITIVE_INFINITY)
  let step = steps.next()
  while (!step.done) step = steps.next()
  return pickMatches(titles, step.value)
}

/** Cede a thread ao navegador (entre as fatias do cruzamento): o desenho e as teclas do controle remoto passam. */
export const yieldToMain = (): Promise<void> =>
  new Promise((resolve) => {
    // `setTimeout` encadeado é limitado a 4 ms pelo navegador; a mensagem cede a thread sem esse atraso (feature 065).
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0)
      return
    }
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })

/** Registros por fatia do índice assíncrono: ≈ 8 ms de trabalho em 43 mil registros (medido no desktop). */
export const MATCH_SLICE = 2000

/** Índice por lista de registros (a identidade do array): Top 10 e Dica do mesmo tipo montam uma vez só, mesmo concorrentes. */
const indexCache = new WeakMap<object, Promise<ByKey<never>>>()

/**
 * Mesma regra de `matchDiscoveryTitles`, mas **sem prender a thread**: o índice dos registros é montado em fatias de
 * `MATCH_SLICE`, cedendo a thread entre elas (`yieldFn`), e fica guardado pela identidade de `locals` — o Top 10 e a Dica do
 * mesmo tipo (e as próximas chamadas com a mesma lista) reaproveitam. `locals` e `read` precisam ser os mesmos entre as chamadas
 * que compartilham a lista.
 */
export async function matchDiscoveryTitlesAsync<T>(
  titles: readonly DiscoveryTitle[],
  locals: readonly T[],
  read: LocalTitleFields<T>,
  options: { yieldFn?: () => Promise<void>; sliceSize?: number; signal?: AbortSignal } = {},
): Promise<MatchedTitle<T>[]> {
  if (titles.length === 0) return []
  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      const error = new Error('discovery:cancelled')
      error.name = 'AbortError'
      throw error
    }
  }
  throwIfAborted()
  const yieldFn = options.yieldFn ?? yieldToMain
  const sliceSize = options.sliceSize ?? MATCH_SLICE
  let promise = indexCache.get(locals) as Promise<ByKey<T>> | undefined
  if (!promise) {
    promise = (async () => {
      const steps = indexLocals(locals, read, sliceSize)
      let step = steps.next()
      while (!step.done) {
        await yieldFn()
        step = steps.next()
      }
      return step.value
    })()
    indexCache.set(locals, promise as Promise<ByKey<never>>)
    promise.catch(() => indexCache.delete(locals)) // falha não fica guardada
  }
  const byKey = await promise
  throwIfAborted()
  return pickMatches(titles, byKey)
}
/** Top 10: os cruzados na ordem do ranking, no máximo `DISCOVERY_LIMIT`, cada um com a posição real; menos de `TOP10_MIN` → `[]`. */
export function selectTop10<T>(matches: readonly MatchedTitle<T>[]): Array<{ local: T; rank: number }> {
  if (matches.length < TOP10_MIN) return []
  return matches.slice(0, DISCOVERY_LIMIT).map((match) => ({ local: match.local, rank: match.title.rank }))
}

/**
 * Dica: filtra (nota ≥ `TIP_MIN_VOTE_AVERAGE`, votos ≥ `TIP_MIN_VOTES[kind]`, ano entre `anoCorrente − TIP_YEARS` e `anoCorrente`),
 * exige `TIP_MIN` válidos e sorteia `limit` (padrão `DISCOVERY_LIMIT`) com peso de popularidade, estável para a mesma `seed`.
 * A ordem devolvida é a do sorteio.
 */
export function selectTip<T>(
  matches: readonly MatchedTitle<T>[],
  options: { now: number; seed: string; limit?: number; min?: number },
): T[] {
  const limit = options.limit ?? DISCOVERY_LIMIT
  const min = options.min ?? TIP_MIN
  const currentYear = new Date(options.now).getFullYear()
  const valid = matches.filter(({ title }) => {
    if (title.voteAverage < TIP_MIN_VOTE_AVERAGE || title.voteCount < TIP_MIN_VOTES[title.kind]) return false
    return title.year !== undefined && title.year >= currentYear - TIP_YEARS && title.year <= currentYear
  })
  if (valid.length < min || !(limit > 0)) return []
  return valid
    .map((match) => {
      // Chave de Efraimidis–Spirakis: menor chave = sorteado; a popularidade pesa sem deixar poucos blockbusters ganharem sempre.
      const u = (fnv1a32(`${options.seed}|${match.title.tmdbId}`) + 1) / 4294967297
      const weight = Math.sqrt(Math.max(match.title.popularity, 1))
      return { match, key: -Math.log(u) / weight }
    })
    .sort((a, b) => a.key - b.key || a.match.title.tmdbId - b.match.title.tmdbId)
    .slice(0, limit)
    .map((entry) => entry.match.local)
}
