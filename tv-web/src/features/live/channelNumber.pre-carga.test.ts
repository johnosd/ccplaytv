import { describe, expect, it } from 'vitest'
import type { CatalogCategory } from '../catalog/catalogApi'
import { knownCategoryCount } from './channelNumber'

function cat(overrides: Partial<CatalogCategory>): CatalogCategory {
  return { id: 1, kind: 'channel', order: 0, count: 0, fetchMode: 'on_demand', ...overrides }
}

describe('knownCategoryCount — feature 038 (SC-007)', () => {
  it('on_demand não carregada: nenhum número, nem 0', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'on_demand', count: 0 }))).toBeUndefined()
  })

  it('on_demand carregada: o número do disco (inclusive 0 real)', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'on_demand', count: 103, itemsFetchedAt: 1 }))).toBe(103)
    expect(knownCategoryCount(cat({ fetchMode: 'on_demand', count: 0, itemsFetchedAt: 1 }))).toBe(0)
  })

  it('stored: antes de ler, a contagem da varredura; depois, a do disco — mesmo com uma atualização pendente', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'stored', declaredCount: 40 }))).toBe(40)
    // Atualização trouxe 45 no arquivo novo, mas os itens mostrados ainda são os 40 de antes.
    expect(knownCategoryCount(cat({ fetchMode: 'stored', declaredCount: 45, count: 40, itemsFetchedAt: 1, renewRequestedAt: 2 }))).toBe(40)
  })

  it('eager: sempre o disco', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'eager', count: 7 }))).toBe(7)
  })
})
