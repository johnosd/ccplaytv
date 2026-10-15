/**
 * Contrato da feature 049 (navegação por página) — travado em
 * `sdd/specs/049-navegacao-por-pagina/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { pagedIndex, pageSizeFor } from './paging'

describe('paginação — contrato da feature 049', () => {
  // FR-001/FR-002 (uma página = o que cabe, avança/volta essa distância), FR-003 (para nas bordas, sem dar a volta), SC-001, Edge Cases (lista curta/vazia)
  it('avança e volta uma página, para no último/primeiro item, lista curta vai ao extremo e vazia não tem alvo', () => {
    expect(pageSizeFor(640, 84)).toBe(7)
    expect(pageSizeFor(50, 84)).toBe(1) // menos de uma linha: ainda anda 1
    expect(pageSizeFor(0, 84)).toBe(1)

    expect(pagedIndex(2, 200, 8, 'next')).toBe(10)
    expect(pagedIndex(10, 200, 8, 'previous')).toBe(2)
    expect(pagedIndex(2, 200, 8, 'previous')).toBe(0) // primeira página: vai ao primeiro e para
    expect(pagedIndex(0, 200, 8, 'previous')).toBe(0)
    expect(pagedIndex(195, 200, 8, 'next')).toBe(199) // última página: vai ao último e para
    expect(pagedIndex(199, 200, 8, 'next')).toBe(199)

    expect(pagedIndex(1, 5, 8, 'next')).toBe(4) // cabe inteira: extremo
    expect(pagedIndex(3, 5, 8, 'previous')).toBe(0)
    expect(pagedIndex(0, 10, 0, 'next')).toBe(1) // página nunca menor que 1
    expect(pagedIndex(0, 0, 8, 'next')).toBeNull()

    // SC-001: 300 canais, 8 linhas → no máximo ⌈300/8⌉ = 38 toques em → para chegar ao último.
    let index = 0
    let taps = 0
    while (index !== 299) {
      index = pagedIndex(index, 300, 8, 'next') ?? index
      taps += 1
    }
    expect(taps).toBeLessThanOrEqual(38)
  })
})
