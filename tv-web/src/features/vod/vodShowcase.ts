import type { CatalogItemOut } from '../catalog/catalogApi'

/** Itens por fileira da vitrine (spec 052, FR-003). */
export const SHOWCASE_LIMIT = 12

/**
 * "Adicionados recentemente" (feature 052, FR-003): os `limit` itens com data de inclusão (`added_at`) mais nova, do
 * mais novo ao mais antigo. Item sem data fica de fora (nunca inventa data); empate mantém a ordem de entrada.
 * Só lê o que recebeu — nenhuma consulta. Regras em `logic/vitrine-e-foco.md` §2.
 */
export function recentlyAdded(items: readonly CatalogItemOut[], limit: number = SHOWCASE_LIMIT): CatalogItemOut[] {
  if (!(limit > 0)) return []
  // Buffer ordenado (mais novo primeiro) de tamanho `limit`: O(n log limit), sem ordenar o catálogo inteiro.
  // Empate: quem veio primeiro fica na frente (a busca binária insere DEPOIS dos iguais).
  const top: { item: CatalogItemOut; at: number }[] = []
  for (const item of items) {
    const at = item.added_at
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    if (top.length === limit && at <= top[top.length - 1].at) continue
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
  return top.map((entry) => entry.item)
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

/**
 * Regra do formato `wide` da fileira "Continue assistindo" (feature 053, D-006): só quando TODOS os itens mostrados têm
 * uma imagem horizontal real já guardada no aparelho. Sem isso, o pôster alto — nunca uma imagem genérica nem recortada.
 */
export function allHaveBackdrop(items: readonly CatalogItemOut[], backdrops: ReadonlyMap<string, string>, limit: number = SHOWCASE_LIMIT): boolean {
  const shown = items.slice(0, limit)
  return shown.length > 0 && shown.every((item) => backdrops.has(item.id))
}
