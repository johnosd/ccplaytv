import { describe, expect, it } from 'vitest'
import { topHalfScrollDelta, type VerticalRect } from './revealInTopHalf'

const rect = (top: number, height: number): VerticalRect => ({ top, height, bottom: top + height })
const screen = rect(0, 1080)

describe('topHalfScrollDelta', () => {
  it('bloco já inteiro na metade de cima: não rola', () => {
    expect(topHalfScrollDelta(rect(200, 130), screen)).toBe(0)
  })

  it('bloco na metade de baixo: rola para ancorá-lo a 10% do topo', () => {
    expect(topHalfScrollDelta(rect(800, 130), screen)).toBe(800 - 108)
  })

  it('bloco que cruza a metade (parte dele embaixo): rola', () => {
    expect(topHalfScrollDelta(rect(500, 130), screen)).toBeGreaterThan(0)
  })

  it('bloco acima do topo: o delta é negativo (rola para cima)', () => {
    expect(topHalfScrollDelta(rect(-60, 130), screen)).toBeLessThan(0)
  })

  it('contêiner com offset (palco escalado/deslocado) usa as coordenadas relativas a ele', () => {
    const container = rect(100, 1000)
    expect(topHalfScrollDelta(rect(300, 130), container)).toBe(0)
    expect(topHalfScrollDelta(rect(900, 130), container)).toBe(900 - (100 + 100))
  })

  it('contêiner sem altura (jsdom): não rola', () => {
    expect(topHalfScrollDelta(rect(800, 130), rect(0, 0))).toBe(0)
  })
})
