import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { recentlyAdded } from './vodShowcase'

function item(name: string, addedAt: number | null | undefined): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: 'source-1',
    original_name: name,
    added_at: addedAt,
  }
}

describe('recentlyAdded — casos de borda', () => {
  it('limite 0 ou negativo e entrada vazia devolvem lista vazia', () => {
    expect(recentlyAdded([item('a', 1)], 0)).toEqual([])
    expect(recentlyAdded([item('a', 1)], -3)).toEqual([])
    expect(recentlyAdded([])).toEqual([])
  })

  it('ignora datas não finitas e mantém a ordem num bloco de datas iguais', () => {
    const items = [item('x', Number.NaN), item('y', Number.POSITIVE_INFINITY), ...['a', 'b', 'c', 'd'].map((n) => item(n, 7))]
    expect(recentlyAdded(items, 3).map((entry) => entry.name)).toEqual(['a', 'b', 'c'])
  })

  it('um item mais novo que todos expulsa o mais antigo do buffer cheio', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3), item('novo', 10)]
    expect(recentlyAdded(items, 3).map((entry) => entry.name)).toEqual(['novo', 'c', 'b'])
  })
})
