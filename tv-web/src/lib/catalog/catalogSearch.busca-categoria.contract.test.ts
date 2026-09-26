/**
 * Teste de CONTRATO da feature 018 (busca por categoria) — travado em
 * `sdd/specs/018-busca-por-categoria/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { searchWithinItems } from './catalogSearch'

interface Fake {
  id: string
  name: string
}

function item(id: string, name: string): Fake {
  return { id, name }
}

describe('searchWithinItems (feature 018)', () => {
  // FR-005/FR-007/FR-012: genérica (não só CatalogRecord), normaliza
  // acento/caixa, prefixo do termo primeiro, resto depois, cada grupo
  // alfabético.
  it('filtra e ordena por termo sobre um tipo genérico — prefixo primeiro, resto depois, alfabético', () => {
    const items = [
      item('1', 'Globo Notícias'),
      item('2', 'ESPN'),
      item('3', 'Globo Esportes'),
      item('4', 'TV Globo'),
      item('5', 'Ó Globo Rural'),
    ]

    const result = searchWithinItems(items, 'GLÓ', (i) => i.name)

    // Prefixo do termo primeiro (Esportes < Notícias alfabeticamente),
    // depois quem só contém (Ó Globo Rural < TV Globo — "o" < "t").
    expect(result.map((i) => i.name)).toEqual(['Globo Esportes', 'Globo Notícias', 'Ó Globo Rural', 'TV Globo'])
  })
})
