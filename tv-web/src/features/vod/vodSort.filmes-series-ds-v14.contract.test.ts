/**
 * Teste de CONTRATO da feature 025 (Filmes e Séries no DS V14) — Ordenar.
 * Travado em `sdd/specs/025-filmes-series-ds-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { availableSortOptions, sortVodItems } from './vodSort'

function item(name: string, year: number | null, addedAt: number | null): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    year,
    added_at: addedAt,
  }
}

describe('vodSort — contrato da feature 025', () => {
  // FR-019, FR-020, US4/AC4, US4/AC5, SC-006, Constitution: "Progresso e Capacidades São Reais, Nunca Prometidos"
  it('só oferece opção com dado real; sem o dado vai para o fim; empate mantém a ordem da fonte; nunca muta a entrada', () => {
    // Ordem da fonte: b, Á, c, a.
    const items = [item('b', 2001, 10), item('Á', null, null), item('c', 2020, 30), item('a', 2001, null)]
    const snapshot = items.map((i) => i.name)

    expect(availableSortOptions(items)).toEqual(['source', 'az', 'year', 'added'])
    expect(availableSortOptions([item('x', null, null), item('y', null, null)])).toEqual(['source', 'az'])
    expect(availableSortOptions([item('x', 1999, null)])).toEqual(['source', 'az', 'year'])

    const names = (list: CatalogItemOut[]) => list.map((i) => i.name)
    expect(names(sortVodItems(items, 'source'))).toEqual(['b', 'Á', 'c', 'a'])
    // Mais novo primeiro; b e a empatam em 2001 e mantêm a ordem da fonte; sem ano no fim.
    expect(names(sortVodItems(items, 'year'))).toEqual(['c', 'b', 'a', 'Á'])
    // Inclusão mais recente primeiro; os dois sem data no fim, na ordem da fonte.
    expect(names(sortVodItems(items, 'added'))).toEqual(['c', 'b', 'Á', 'a'])
    // Comparação sem acento/caixa: "Á" e "a" empatam e mantêm a ordem da fonte.
    expect(names(sortVodItems(items, 'az'))).toEqual(['Á', 'a', 'b', 'c'])

    expect(items.map((i) => i.name)).toEqual(snapshot)
  })
})
