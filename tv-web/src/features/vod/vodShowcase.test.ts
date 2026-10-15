import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { recentlyAdded, recentlyAddedBy } from './vodShowcase'

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

describe('recentlyAddedBy — mesma regra, sem mapear o catálogo inteiro (bug tela-principal-filmes-lenta-na-tv)', () => {
  interface Row {
    name: string
    at: unknown
  }
  const row = (name: string, at: unknown): Row => ({ name, at })
  const by = (rows: Iterable<Row>, limit?: number) => recentlyAddedBy(rows, (r) => r.at, limit).map((r) => r.name)

  it('dá a mesma escolha de recentlyAdded para os mesmos dados (ordem, empate e descarte de item sem data)', () => {
    const rows = [row('a', 5), row('sem data', null), row('b', 9), row('c', 9), row('nan', Number.NaN), row('d', 1), row('e', 7), row('texto', '99')]
    const asItems = rows.map((r) => item(r.name, r.at as number | null))
    expect(by(rows, 4)).toEqual(recentlyAdded(asItems, 4).map((entry) => entry.name))
    expect(by(rows, 4)).toEqual(['b', 'c', 'e', 'a']) // empate 9: b antes de c; "99" em texto não é data
  })

  it('só lê a data de cada entrada uma vez e devolve as próprias entradas (nada é copiado nem mapeado)', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(`r${i}`, i))
    let reads = 0
    const top = recentlyAddedBy(rows, (r) => ((reads += 1), r.at), 12)
    expect(reads).toBe(1000)
    expect(top).toHaveLength(12)
    expect(top[0]).toBe(rows[999])
    expect(top.map((r) => r.name)).toEqual(Array.from({ length: 12 }, (_, i) => `r${999 - i}`))
  })

  it('aceita qualquer iterável e limite 0 devolve vazio', () => {
    expect(by(new Set([row('a', 1), row('b', 2)]), 5)).toEqual(['b', 'a'])
    expect(by([row('a', 1)], 0)).toEqual([])
  })
})