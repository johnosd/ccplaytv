import { describe, expect, it } from 'vitest'
import { describeScope, isScopeEmpty, scopeSummaries } from './privacyModel'

describe('privacyModel (feature 036, §5/§11)', () => {
  it('texto da linha: singular/plural e indisponíveis só quando há', () => {
    expect(describeScope({ titles: 1, unavailable: 0, hasProgress: false })).toBe('1 título')
    expect(describeScope({ titles: 3, unavailable: 2, hasProgress: false })).toBe('3 títulos · 2 indisponíveis')
    expect(describeScope({ titles: 0, unavailable: 4, hasProgress: false })).toBe('0 títulos · 4 indisponíveis')
  })

  it('"Ambos" soma os dois e só fica vazio quando os dois estão', () => {
    const empty = { titles: 0, unavailable: 0, hasProgress: false }
    const both = scopeSummaries({ movies: empty, series: { titles: 0, unavailable: 1, hasProgress: true } }).both
    expect(both).toEqual({ titles: 0, unavailable: 1, hasProgress: true })
    expect(isScopeEmpty(both)).toBe(false)
    expect(isScopeEmpty(scopeSummaries({ movies: empty, series: empty }).both)).toBe(true)
  })
})
