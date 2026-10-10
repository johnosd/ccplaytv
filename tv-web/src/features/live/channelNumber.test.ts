import { describe, expect, it } from 'vitest'
import { channelNumberOf, knownCategoryCount, withoutLockedCategories } from './channelNumber'
import type { CatalogCategory } from '../catalog/catalogApi'

function cat(overrides: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id: 1,
    kind: 'channel',
    name: 'Cat',
    order: 0,
    count: 0,
    fetchMode: 'on_demand',
    ...overrides,
  }
}

describe('knownCategoryCount (feature 024, logic/numero-do-canal.md §3)', () => {
  it('stored: usa declaredCount (contagem real da varredura), nunca count', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'stored', declaredCount: 12, count: 0 }))).toBe(12)
  })

  it('stored sem declaredCount (nunca varrida) é desconhecida', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'stored', declaredCount: undefined }))).toBeUndefined()
  })

  it('eager: usa count — os itens já estão todos gravados', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'eager', count: 7 }))).toBe(7)
  })

  it('on_demand nunca lida (itemsFetchedAt ausente): desconhecida, mesmo com count preenchido', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'on_demand', count: 5, itemsFetchedAt: undefined }))).toBeUndefined()
  })

  it('on_demand já lida: usa count real, ignora declaredCount do painel (podem divergir)', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'on_demand', count: 3, declaredCount: 100, itemsFetchedAt: 1000 }))).toBe(3)
  })

  it('on_demand já lida e vazia de fato: 0 é conhecido, não "desconhecida"', () => {
    expect(knownCategoryCount(cat({ fetchMode: 'on_demand', count: 0, itemsFetchedAt: 1000 }))).toBe(0)
  })
})

describe('channelNumberOf — cenários adicionais (contrato central em channelNumber.live-tv-ds-v14.contract.test.ts)', () => {
  it('categoria própria com contagem conhecida mas position ausente (registro anterior à feature): sem número', () => {
    const categories = [cat({ id: 1, order: 0, fetchMode: 'eager', count: 5 })]
    expect(channelNumberOf({ category_id: 1, category_position: undefined }, categories)).toBeNull()
  })

  it('primeira categoria (sem anteriores): offset zero, número = position + 1', () => {
    const categories = [cat({ id: 1, order: 0, fetchMode: 'eager', count: 5 })]
    expect(channelNumberOf({ category_id: 1, category_position: 0 }, categories)).toBe('001')
    expect(channelNumberOf({ category_id: 1, category_position: 4 }, categories)).toBe('005')
  })

  it('duas categorias eager: a 2ª soma a contagem da 1ª', () => {
    const categories = [
      cat({ id: 1, order: 0, fetchMode: 'eager', count: 3 }),
      cat({ id: 2, order: 1, fetchMode: 'eager', count: 10 }),
    ]
    expect(channelNumberOf({ category_id: 2, category_position: 0 }, categories)).toBe('004')
  })

  it('categoria anterior on_demand nunca lida: número ausente mesmo para a categoria própria já conhecida', () => {
    const categories = [
      cat({ id: 1, order: 0, fetchMode: 'on_demand', count: 0, itemsFetchedAt: undefined }),
      cat({ id: 2, order: 1, fetchMode: 'on_demand', count: 4, itemsFetchedAt: 1000 }),
    ]
    expect(channelNumberOf({ category_id: 2, category_position: 0 }, categories)).toBeNull()
  })
})

describe('channelNumberOf — categoria escondida antes (feature 066, D-012/R-008)', () => {
  it('o número de um canal não muda ao esconder uma categoria anterior', () => {
    const news = cat({ id: 1, order: 0, fetchMode: 'eager', count: 10 })
    const sports = cat({ id: 2, order: 1, fetchMode: 'eager', count: 4 })
    const channel = { category_id: 2, category_position: 0, source_number: null }
    const before = channelNumberOf(channel, [news, sports])

    // Trilha filtrada: "Notícias" escondida sai da lista e entra em `hiddenBefore` da seguinte.
    expect(channelNumberOf(channel, [{ ...sports, hiddenBefore: [news] }])).toBe(before)
    expect(before).toBe('011')
  })
})

describe('withoutLockedCategories (feature 066, guia sem bloqueadas, D-012)', () => {
  it('tira as bloqueadas e mantém o número dos canais seguintes', () => {
    const news = cat({ id: 1, order: 0, fetchMode: 'eager', count: 10 })
    const adult = { ...cat({ id: 2, order: 1, fetchMode: 'eager', count: 5 }), locked: true }
    const sports = cat({ id: 3, order: 2, fetchMode: 'eager', count: 4 })
    const channel = { category_id: 3, category_position: 0, source_number: null }
    const all = [news, adult, sports]

    const shown = withoutLockedCategories(all)
    expect(shown.map((category) => category.id)).toEqual([1, 3])
    expect(channelNumberOf(channel, shown)).toBe(channelNumberOf(channel, all))
    expect(channelNumberOf(channel, shown)).toBe('016')
  })
})
