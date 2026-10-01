import { describe, expect, it } from 'vitest'
import { locateOrNeighbor } from './reconcileFocus'

const ids = (...list: string[]) => list.map((id) => ({ id }))

describe('locateOrNeighbor (feature 038, FR-027)', () => {
  it('acha pelo id, mesmo se a posição mudou', () => {
    expect(locateOrNeighbor(ids('c', 'a', 'b'), (i) => i.id === 'b', 'cat-1', { listKey: 'cat-1', index: 1 })).toBe(2)
  })

  it('item saiu da mesma lista: vizinho na posição onde estava, nunca o topo', () => {
    expect(locateOrNeighbor(ids('a', 'b', 'd'), (i) => i.id === 'c', 'cat-1', { listKey: 'cat-1', index: 2 })).toBe(2)
    // Era o último: o novo último.
    expect(locateOrNeighbor(ids('a', 'b'), (i) => i.id === 'c', 'cat-1', { listKey: 'cat-1', index: 2 })).toBe(1)
  })

  it('outra lista (trocou de categoria): começa no primeiro item', () => {
    expect(locateOrNeighbor(ids('x', 'y', 'z'), (i) => i.id === 'c', 'cat-2', { listKey: 'cat-1', index: 2 })).toBe(0)
    expect(locateOrNeighbor(ids('x', 'y'), () => false, 'cat-2', null)).toBe(0)
  })

  it('lista vazia: 0', () => {
    expect(locateOrNeighbor([], () => false, 'cat-1', { listKey: 'cat-1', index: 4 })).toBe(0)
  })
})
