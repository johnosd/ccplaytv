/**
 * Ordenação da grade de Filmes/Séries (feature 025, FR-019..FR-024) —
 * funções puras, sem React nem banco.
 *
 * Regras completas em `sdd/specs/025-filmes-series-ds-v14/logic/foco-vod.md` §5.
 * STUB do sdd-plan: ponto de partida do sdd-execute (não travado).
 */

import type { CatalogItemOut } from '../catalog/catalogApi'

/** `source` = ordem da fonte (padrão). */
export type VodSortOption = 'source' | 'az' | 'year' | 'added'

export const VOD_SORT_LABELS: Record<VodSortOption, string> = {
  source: 'Ordem da fonte',
  az: 'A–Z',
  year: 'Ano',
  added: 'Recém-adicionados',
}

/**
 * Opções oferecidas para os itens carregados na entrada aberta, na ordem de
 * exibição do modal. "Ordem da fonte" e "A–Z" sempre; "Ano"/"Recém-
 * adicionados" só quando ao menos um item tem o dado (FR-019).
 */
export function availableSortOptions(items: CatalogItemOut[]): VodSortOption[] {
  const options: VodSortOption[] = ['source', 'az']
  if (items.some((item) => item.year != null)) options.push('year')
  if (items.some((item) => item.added_at != null)) options.push('added')
  return options
}

/**
 * Comparador que ordena por `getKey` (maior/mais recente primeiro quando
 * `order: 'desc'`), sempre deixando ausência para o fim e preservando a
 * ordem da fonte tanto entre ausentes quanto em empate (`Array.prototype.sort`
 * é estável no alvo — `research.md` R2).
 */
function withMissingLast(
  getKey: (item: CatalogItemOut) => number | null | undefined,
  order: 'asc' | 'desc',
): (a: CatalogItemOut, b: CatalogItemOut) => number {
  return (a, b) => {
    const av = getKey(a)
    const bv = getKey(b)
    const aMissing = av == null
    const bMissing = bv == null
    if (aMissing && bMissing) return 0
    if (aMissing) return 1
    if (bMissing) return -1
    if (av === bv) return 0
    const cmp = av < bv ? -1 : 1
    return order === 'desc' ? -cmp : cmp
  }
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/**
 * Nova lista ordenada (nunca muta a entrada). Itens sem o dado vão para o
 * fim; empates mantêm a ordem da fonte (FR-020).
 */
export function sortVodItems(items: CatalogItemOut[], option: VodSortOption): CatalogItemOut[] {
  switch (option) {
    case 'source':
      return [...items]
    case 'az':
      return [...items].sort((a, b) => collator.compare(a.name, b.name))
    case 'year':
      return [...items].sort(withMissingLast((item) => item.year, 'desc'))
    case 'added':
      return [...items].sort(withMissingLast((item) => item.added_at, 'desc'))
  }
}
