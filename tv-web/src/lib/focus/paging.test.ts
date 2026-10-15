// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { measuredRowPitch, pagedIndex, pageSizeFor, scrollByPage, TRAIL_ROW_PITCH_FALLBACK } from './paging'

describe('pageSizeFor / pagedIndex — bordas', () => {
  it('valores inválidos viram página de 1 e índice preso', () => {
    expect(pageSizeFor(Number.NaN, 84)).toBe(1)
    expect(pageSizeFor(640, 0)).toBe(1)
    expect(pageSizeFor(640, -5)).toBe(1)
    expect(pagedIndex(0, 10, Number.NaN, 'next')).toBe(1)
    expect(pagedIndex(0, 10, 2.9, 'next')).toBe(2)
    expect(pagedIndex(-4, 10, 3, 'next')).toBe(3) // índice abaixo da faixa conta como 0
    expect(pagedIndex(50, 10, 3, 'previous')).toBe(6) // acima da faixa conta como o último (9)
  })
})

describe('measuredRowPitch / scrollByPage', () => {
  function trail(offsets: number[]) {
    const container = document.createElement('div')
    for (const top of offsets) {
      const item = document.createElement('button')
      item.className = 'item'
      Object.defineProperty(item, 'offsetTop', { configurable: true, value: top })
      container.appendChild(item)
    }
    return container
  }

  it('mede o passo entre itens vizinhos e cai no fallback sem medida', () => {
    expect(measuredRowPitch(trail([0, 60, 120]), '.item')).toBe(60)
    expect(measuredRowPitch(trail([0, 0, 0]), '.item')).toBe(TRAIL_ROW_PITCH_FALLBACK)
    expect(measuredRowPitch(trail([0]), '.item')).toBe(TRAIL_ROW_PITCH_FALLBACK)
    expect(measuredRowPitch(null, '.item')).toBe(TRAIL_ROW_PITCH_FALLBACK)
  })

  it('rola uma página para a frente e para trás, sem ficar negativo', () => {
    const el = document.createElement('div')
    el.scrollTop = 100
    scrollByPage(el, 'next', 7, 84)
    expect(el.scrollTop).toBe(100 + 7 * 84)
    scrollByPage(el, 'previous', 7, 84)
    expect(el.scrollTop).toBe(100)
    scrollByPage(el, 'previous', 7, 84)
    expect(el.scrollTop).toBe(0)
    expect(() => scrollByPage(null, 'next', 7, 84)).not.toThrow()
  })
})
