import { describe, expect, it } from 'vitest'
import { verticalScrollEdges } from './scrollEdges'

describe('verticalScrollEdges', () => {
  it('tudo cabe: sem borda com conteúdo', () => {
    expect(verticalScrollEdges({ scrollTop: 0, scrollHeight: 300, clientHeight: 300 })).toEqual({ start: false, end: false })
  })

  it('no topo de uma lista maior que a vista: só a borda de baixo', () => {
    expect(verticalScrollEdges({ scrollTop: 0, scrollHeight: 1600, clientHeight: 800 })).toEqual({ start: false, end: true })
  })

  it('no meio: as duas bordas', () => {
    expect(verticalScrollEdges({ scrollTop: 400, scrollHeight: 1600, clientHeight: 800 })).toEqual({ start: true, end: true })
  })

  it('no fim: só a borda de cima', () => {
    expect(verticalScrollEdges({ scrollTop: 800, scrollHeight: 1600, clientHeight: 800 })).toEqual({ start: true, end: false })
  })

  it('arredondamento de subpixel (≤ 1px) não acende fade', () => {
    expect(verticalScrollEdges({ scrollTop: 0.5, scrollHeight: 1600.6, clientHeight: 1600 })).toEqual({ start: false, end: false })
  })
})
