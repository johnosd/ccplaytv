/**
 * Teste de CONTRATO da feature 052 (vitrine de Filmes e Séries) — a regra pura de "Adicionados recentemente".
 * Travado em `sdd/specs/052-vitrine-filmes-series/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca
 * editá-lo.
 */
import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { recentlyAdded, SHOWCASE_LIMIT } from './vodShowcase'

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

describe('recentlyAdded — contrato da feature 052', () => {
  // FR-003, US2/AC3, Constitution: "IA e Classificação Nunca Inventam Dados" (sem data, fora; nada é inventado)
  it('até 12 itens do mais novo ao mais antigo, ignora item sem data e mantém a ordem de entrada nos empates', () => {
    expect(SHOWCASE_LIMIT).toBe(12)

    const items = [
      item('sem-data-1', null),
      item('antigo', 100),
      item('empate-a', 500),
      item('sem-data-2', undefined),
      item('novo', 900),
      item('empate-b', 500),
      ...Array.from({ length: 12 }, (_, i) => item(`fila-${i}`, 200 + i)),
    ]

    const result = recentlyAdded(items)
    expect(result).toHaveLength(12)
    expect(result.map((entry) => entry.name).slice(0, 4)).toEqual(['novo', 'empate-a', 'empate-b', 'fila-11'])
    expect(result.some((entry) => entry.name.startsWith('sem-data'))).toBe(false)
    // Do mais novo ao mais antigo, sem exceção.
    const dates = result.map((entry) => entry.added_at as number)
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)

    expect(recentlyAdded(items, 3).map((entry) => entry.name)).toEqual(['novo', 'empate-a', 'empate-b'])
    expect(recentlyAdded([item('so-sem-data', null)])).toEqual([])
    // Não muda a lista de entrada.
    expect(items[0].name).toBe('sem-data-1')
  })
})
