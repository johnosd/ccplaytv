import { describe, expect, it } from 'vitest'
import { allHaveBackdrop } from './vodShowcase'
import type { CatalogItemOut } from '../catalog/catalogApi'

const item = (id: string) => ({ id }) as CatalogItemOut

describe('allHaveBackdrop (feature 053, formato wide)', () => {
  it('só vale com todos os itens mostrados com backdrop; vazio e parcial não', () => {
    const items = [item('a'), item('b')]
    expect(allHaveBackdrop(items, new Map([['a', 'u1'], ['b', 'u2']]))).toBe(true)
    expect(allHaveBackdrop(items, new Map([['a', 'u1']]))).toBe(false)
    expect(allHaveBackdrop([], new Map())).toBe(false)
  })

  it('itens além do limite mostrado não contam', () => {
    const items = [item('a'), item('b'), item('c')]
    expect(allHaveBackdrop(items, new Map([['a', 'u1'], ['b', 'u2']]), 2)).toBe(true)
  })
})
