import { describe, expect, it } from 'vitest'
import type { CatalogCategory } from '../catalog/catalogApi'
import { liveEntryKey, trailKeyOf } from './liveTrail'

function category(id: number, name: string): CatalogCategory {
  return { id, kind: 'channel', name, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

const categories = [category(1, 'Esportes'), category(2, 'Notícias')]

describe('liveEntryKey / trailKeyOf (feature 046)', () => {
  it('favoritos e todos viram a própria chave', () => {
    expect(liveEntryKey({ kind: 'favorites' }, categories)).toBe('favorites')
    expect(liveEntryKey({ kind: 'all' }, categories)).toBe('all')
    expect(trailKeyOf({ kind: 'favorites' }, categories)).toEqual({ kind: 'favorites' })
    expect(trailKeyOf({ kind: 'all' }, categories)).toEqual({ kind: 'all' })
  })

  it('categoria vira chave pelo NOME do grupo, não pelo id', () => {
    expect(liveEntryKey({ kind: 'category', id: 2 }, categories)).toBe('category:Notícias')
    expect(trailKeyOf({ kind: 'category', id: 2 }, categories)).toEqual({ kind: 'category', name: 'Notícias' })
  })

  it('categoria que sumiu do catálogo dá undefined', () => {
    expect(liveEntryKey({ kind: 'category', id: 99 }, categories)).toBeUndefined()
    expect(trailKeyOf({ kind: 'category', id: 99 }, categories)).toBeUndefined()
  })
})
