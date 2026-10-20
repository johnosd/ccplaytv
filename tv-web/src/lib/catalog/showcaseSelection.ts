/**
 * Lógica pura de seleção das fileiras calculadas (feature 086).
 *
 * **Movida** de `features/vod/vodShowcase.ts`: `lib/` não pode importar de `features/` (ratchet `lib-to-ui`) e a montagem
 * por candidatos (`showcaseRows.ts`) precisa exatamente destes acumuladores — são eles que garantem que o resultado
 * continue idêntico ao de hoje (`logic/selecoes-guardadas.md` §2). O algoritmo NÃO mudou.
 *
 * `features/vod/vodShowcase.ts` reexporta daqui, para os contratos travados das features 052 e 065 continuarem valendo.
 */

import { db, type CatalogDb, type CatalogReadItem, type CatalogRecord } from './db'
import { iterateKindRecordBatches } from './catalogDerivedRows'
import { listVisibleCategories } from './categoryAccess'
import { isCovered } from './catalogSearch'
import { projectReadItem } from './readProjection'
import { createRatedSelectionAccumulator, dayKey } from './ratedSelection'

/** Itens por fileira da vitrine (spec 052, FR-003). */
export const SHOWCASE_LIMIT = 12

/**
 * Mesma regra de `recentlyAdded`, para qualquer tipo de entrada: `addedAt` lê a data de cada uma e só as `limit` escolhidas são
 * devolvidas — quem chama mapeia para o item de tela **depois** (sem mapear o catálogo inteiro, ≈43 mil registros, só para
 * ficar com 12). Item sem data (ausente, `null`, não finita) fica de fora; empate mantém a ordem de entrada.
 */
export function recentlyAddedBy<T>(items: Iterable<T>, addedAt: (item: T) => unknown, limit: number = SHOWCASE_LIMIT): T[] {
  const accumulator = createRecentlyAddedAccumulator(addedAt, limit)
  for (const item of items) accumulator.add(item)
  return accumulator.finish()
}

/** Versão incremental de `recentlyAddedBy` (feature 065): recebe um item por vez, sem materializar o tipo inteiro. */
export function createRecentlyAddedAccumulator<T>(addedAt: (item: T) => unknown, limit: number = SHOWCASE_LIMIT) {
  // Buffer ordenado (mais novo primeiro) de tamanho `limit`: O(n log limit), sem ordenar o catálogo inteiro.
  // Empate: quem veio primeiro fica na frente (a busca binária insere DEPOIS dos iguais).
  const top: { item: T; at: number }[] = []
  const add = (item: T): void => {
    if (!(limit > 0)) return
    const at = addedAt(item)
    if (typeof at !== 'number' || !Number.isFinite(at)) return
    if (top.length === limit && at <= top[top.length - 1].at) return
    let low = 0
    let high = top.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (top[mid].at >= at) low = mid + 1
      else high = mid
    }
    top.splice(low, 0, { item, at })
    if (top.length > limit) top.pop()
  }
  return { add, finish: (): T[] => top.map((entry) => entry.item) }
}

/** Mínimo de títulos com nota válida para a fileira "Bem avaliados" existir (feature 056, FR-003). */
export const RATED_MIN = 5

/** Nota do provedor válida (0 < n ≤ 10, finita) ou `undefined` — a mesma régua do `RatingBadge` (feature 056, FR-002). */
export function validProviderRating(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10 ? value : undefined
}

/**
 * Ordem de "Bem avaliados" (feature 056, D-003): negativo quando `a` vem antes de `b` — nota maior primeiro; empate pelo
 * adicionado mais recentemente; sem data fica depois de quem tem data. Compartilhada com `sortVodItems('rating')`.
 */
export function compareByRating(a: { rating: number; addedAt: number | undefined }, b: { rating: number; addedAt: number | undefined }): number {
  if (a.rating !== b.rating) return b.rating - a.rating
  if (a.addedAt === b.addedAt) return 0
  if (a.addedAt === undefined) return 1
  if (b.addedAt === undefined) return -1
  return b.addedAt - a.addedAt
}

/** Data de adição utilizável (finita) ou `undefined`. */
export function finiteAddedAt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// --- Varredura de referência (feature 086) ---------------------------------------------------------------------
// Mantida como prova de correção (o contrato C1 compara a montagem por candidatos com ela) e caminho de reserva.
// NÃO é chamada na abertura das telas (FR-002): ela percorre o tipo inteiro.


export interface ShowcaseScanResult {
  recent: CatalogReadItem[]
  rated: CatalogReadItem[]
  coveredCategories: number
  totalCategories: number
}

export interface ShowcaseScanOptions {
  database?: CatalogDb
  /** Instante da seleção — define a semente diária de "Bem avaliados". */
  now?: number
  signal?: AbortSignal
}

/** Campos que as duas seleções leem de um item, iguais nos dois caminhos (varredura e candidatos). */
export const RATED_FIELDS = {
  id: (item: CatalogReadItem) => String(item.id),
  name: (item: CatalogReadItem) => item.name,
  rating: (item: CatalogReadItem) => item.providerRating,
  year: (item: CatalogReadItem) => item.year,
  addedAt: (item: CatalogReadItem) => item.addedAt,
}

/** Semente diária de "Bem avaliados": mesma do caminho de hoje, para a escolha não mudar entre os dois caminhos. */
export function showcaseSeed(sourceId: string, kind: string, now: number): string {
  return `${dayKey(now)}|${kind}|${sourceId}`
}

/** Converte um registro do catálogo no item que as fileiras guardam e mostram. */
export function toShowcaseItem(record: CatalogRecord): CatalogReadItem {
  return projectReadItem(record, {
    sourceId: record.sourceId,
    generation: record.generation,
    kind: record.kind as CatalogReadItem['kind'],
    categoryId: record.categoryId as number,
    groupOrder: record.groupOrder,
    categoryPosition: record.categoryPosition ?? 0,
  })
}

/** A varredura do tipo inteiro, bloco a bloco — o que a abertura fazia antes da feature 086. */
export async function selectShowcaseRowsByScan(
  sourceId: string,
  kind: 'movie' | 'series',
  options: ShowcaseScanOptions = {},
): Promise<ShowcaseScanResult> {
  const database = options.database ?? db
  const now = options.now ?? Date.now()
  const categories = await listVisibleCategories(sourceId, kind, database)
  const recent = createRecentlyAddedAccumulator<CatalogReadItem>((item) => item.addedAt)
  const rated = createRatedSelectionAccumulator<CatalogReadItem>(RATED_FIELDS, { now, seed: showcaseSeed(sourceId, kind, now) })
  for await (const records of iterateKindRecordBatches(sourceId, kind, { database, signal: options.signal, pageSize: 2000 })) {
    for (const record of records) {
      const item = toShowcaseItem(record)
      recent.add(item)
      rated.add(item)
    }
  }
  return {
    recent: recent.finish(),
    rated: rated.finish().picked,
    coveredCategories: categories.filter(isCovered).length,
    totalCategories: categories.length,
  }
}
