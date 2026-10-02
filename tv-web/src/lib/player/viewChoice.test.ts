import { describe, expect, it } from 'vitest'
import {
  distinctQualities,
  pickAspectForChoice,
  pickQualityForChoice,
  qualityLabel,
  type QualityOption,
} from './viewChoice'

const opt = (id: string, height: number, bitrateKbps?: number): QualityOption => ({ id, height, bitrateKbps })

describe('distinctQualities', () => {
  it('descarta altura inválida e ordena da maior para a menor', () => {
    const result = distinctQualities([opt('a', 480), opt('b', 0), opt('c', NaN), opt('d', -5), opt('e', 1080), opt('f', 720)])
    expect(result.map((o) => o.height)).toEqual([1080, 720, 480])
  })

  it('empate de altura: fica a de maior taxa; empate total, a primeira do motor', () => {
    expect(distinctQualities([opt('lenta', 720, 1000), opt('rapida', 720, 3000)]).map((o) => o.id)).toEqual(['rapida'])
    expect(distinctQualities([opt('x', 720, 2000), opt('y', 720, 2000)]).map((o) => o.id)).toEqual(['x'])
    // taxa ausente conta como 0
    expect(distinctQualities([opt('sem', 720), opt('com', 720, 1)]).map((o) => o.id)).toEqual(['com'])
  })

  it('não muta nem inventa: lista vazia continua vazia', () => {
    expect(distinctQualities([])).toEqual([])
  })
})

describe('qualityLabel', () => {
  it('é a altura que o stream disse, sem nome comercial', () => {
    expect(qualityLabel(opt('a', 1080))).toBe('1080p')
    expect(qualityLabel(opt('b', 2160))).toBe('2160p')
  })
})

describe('pickQualityForChoice', () => {
  const several = [opt('0', 480), opt('1', 1080), opt('2', 720)]

  it('max = a maior altura; min = a menor; auto = null', () => {
    expect(pickQualityForChoice(several, 'max')).toBe('1')
    expect(pickQualityForChoice(several, 'min')).toBe('0')
    expect(pickQualityForChoice(several, 'auto')).toBeNull()
  })

  it('{ height } acha a variante dessa altura; não anunciada = Auto (FR-008)', () => {
    expect(pickQualityForChoice(several, { height: 720 })).toBe('2')
    expect(pickQualityForChoice(several, { height: 360 })).toBeNull()
  })

  it('menos de 2 opções distintas = null, mesmo com max/min/altura', () => {
    expect(pickQualityForChoice([], 'max')).toBeNull()
    expect(pickQualityForChoice([opt('0', 720)], 'max')).toBeNull()
    expect(pickQualityForChoice([opt('0', 720)], { height: 720 })).toBeNull()
    // duas entradas da mesma altura contam como uma só
    expect(pickQualityForChoice([opt('0', 720, 1), opt('1', 720, 2)], 'min')).toBeNull()
  })
})

describe('pickAspectForChoice', () => {
  it('o escolhido se aceito; senão fit; senão null', () => {
    expect(pickAspectForChoice(['fit', 'fill'], 'fill')).toBe('fill')
    expect(pickAspectForChoice(['fit', 'fill'], 'original')).toBe('fit')
    expect(pickAspectForChoice(['fill'], 'original')).toBeNull()
    expect(pickAspectForChoice([], 'fit')).toBeNull()
  })
})
