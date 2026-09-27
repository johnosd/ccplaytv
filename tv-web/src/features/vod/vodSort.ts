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
  void items
  throw new Error('not implemented')
}

/**
 * Nova lista ordenada (nunca muta a entrada). Itens sem o dado vão para o
 * fim; empates mantêm a ordem da fonte (FR-020).
 */
export function sortVodItems(items: CatalogItemOut[], option: VodSortOption): CatalogItemOut[] {
  void items
  void option
  throw new Error('not implemented')
}
