/**
 * Teste de CONTRATO da feature 026 (Home, Busca global e Configurações no
 * DS V14) — busca global. Travado em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `sdd/specs/026-home-busca-configuracoes-ds-v14/logic/busca-global.md`.
 */
import { describe, expect, it } from 'vitest'
import type { CatalogRecord } from './db'
import { buildSearchIndex } from './catalogSearch'
import { searchGlobal, type GlobalSearchIndex } from './globalSearch'

function record(kind: CatalogRecord['kind'], name: string): CatalogRecord {
  return { sourceId: 'fonte-1', generation: 1, kind, name, originalName: name, groupOrder: 0 }
}

const INDEX: GlobalSearchIndex = {
  channel: buildSearchIndex([record('channel', 'Matrix News'), record('channel', 'Globo')], {
    coveredCategories: 1,
    totalCategories: 4,
  }),
  movie: buildSearchIndex([record('movie', 'Duna'), record('movie', 'Animatrix'), record('movie', 'Matrix')], {
    coveredCategories: 1,
    totalCategories: 3,
  }),
  series: buildSearchIndex([record('series', 'Matrioska'), record('series', 'Dark')], {
    coveredCategories: 2,
    totalCategories: 3,
  }),
}

const names = (records: CatalogRecord[]) => records.map((r) => r.name)

describe('searchGlobal — contrato da feature 026', () => {
  // FR-037, FR-038, FR-039, US3/AC2, US3/AC3, Constitution: "Progresso e Capacidades São Reais, Nunca Prometidos"
  it('agrupa por tipo com a normalização da 018, só a partir de 2 caracteres, e sempre devolve a cobertura somada dos três tipos', () => {
    const curto = searchGlobal(INDEX, 'm')
    expect(curto.channels).toEqual([])
    expect(curto.movies).toEqual([])
    expect(curto.series).toEqual([])
    expect({ covered: curto.coveredCategories, total: curto.totalCategories }).toEqual({ covered: 4, total: 10 })

    const acentuado = searchGlobal(INDEX, '  MÁTRIX ')
    expect(names(acentuado.channels)).toEqual(['Matrix News'])
    // Prefixo primeiro, depois quem só contém o termo.
    expect(names(acentuado.movies)).toEqual(['Matrix', 'Animatrix'])
    expect(acentuado.series).toEqual([])
    expect({ covered: acentuado.coveredCategories, total: acentuado.totalCategories }).toEqual({ covered: 4, total: 10 })

    const doisCaracteres = searchGlobal(INDEX, 'ma')
    expect(names(doisCaracteres.series)).toEqual(['Matrioska'])
    expect(names(doisCaracteres.movies)).toEqual(['Matrix', 'Animatrix'])
  })
})
