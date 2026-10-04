import { describe, expect, it } from 'vitest'
import { compareByRating, finiteAddedAt, validProviderRating } from './vodShowcase'

// Feature 056 (T006): bordas da regra genérica além dos contratos travados.

describe('validProviderRating / finiteAddedAt (feature 056)', () => {
  it('aceita 0 < n ≤ 10 e rejeita o resto', () => {
    expect(validProviderRating(10)).toBe(10)
    expect(validProviderRating(0.1)).toBe(0.1)
    for (const bad of [0, -1, 10.01, Number.NaN, Number.POSITIVE_INFINITY, '8', null, undefined]) {
      expect(validProviderRating(bad)).toBeUndefined()
    }
    expect(finiteAddedAt(5)).toBe(5)
    expect(finiteAddedAt(Number.NaN)).toBeUndefined()
    expect(finiteAddedAt('5')).toBeUndefined()
  })

  it('compareByRating: nota maior vem antes; empate pela data mais nova; sem data depois', () => {
    expect(compareByRating({ rating: 9, addedAt: 1 }, { rating: 8, addedAt: 99 })).toBeLessThan(0)
    expect(compareByRating({ rating: 8, addedAt: 50 }, { rating: 8, addedAt: 10 })).toBeLessThan(0)
    expect(compareByRating({ rating: 8, addedAt: undefined }, { rating: 8, addedAt: 10 })).toBeGreaterThan(0)
    expect(compareByRating({ rating: 8, addedAt: undefined }, { rating: 8, addedAt: undefined })).toBe(0)
  })
})
