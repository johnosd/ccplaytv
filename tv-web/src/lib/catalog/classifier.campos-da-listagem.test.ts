import { describe, expect, it } from 'vitest'
import { firstBackdropUrl, normalizeProviderGenres, normalizeProviderRating } from './classifier'

// Feature 055 (T007): bordas dos normalizadores além do contrato travado.
describe('normalizeProviderRating (feature 055)', () => {
  it('espaços ao redor são tolerados; notação científica, infinito e lixo viram ausência', () => {
    expect(normalizeProviderRating('  8 ')).toBe(8)
    expect(normalizeProviderRating('1e1')).toBeUndefined()
    expect(normalizeProviderRating(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(normalizeProviderRating(Number.NaN)).toBeUndefined()
    expect(normalizeProviderRating('8.5.1')).toBeUndefined()
    expect(normalizeProviderRating('.5')).toBeUndefined()
  })

  it('o teto vale antes de arredondar e o zero vale depois', () => {
    expect(normalizeProviderRating('10.04')).toBeUndefined()
    expect(normalizeProviderRating('10')).toBe(10)
    expect(normalizeProviderRating('0.04')).toBeUndefined()
    expect(normalizeProviderRating('0.05')).toBe(0.1)
  })
})

describe('normalizeProviderGenres (feature 055)', () => {
  it('colapsa espaços; vazio, só espaços, "0" e tipos errados viram ausência', () => {
    expect(normalizeProviderGenres('Comédia,   Drama')).toBe('Comédia, Drama')
    expect(normalizeProviderGenres('  ')).toBeUndefined()
    expect(normalizeProviderGenres('0')).toBeUndefined()
    expect(normalizeProviderGenres(0)).toBeUndefined()
    expect(normalizeProviderGenres(['Drama'])).toBeUndefined()
    expect(normalizeProviderGenres(null)).toBeUndefined()
  })
})

describe('firstBackdropUrl (feature 055)', () => {
  it('lista só de inválidas, lista vazia, "0" e tipos errados viram ausência', () => {
    expect(firstBackdropUrl(['x', '', 0])).toBeUndefined()
    expect(firstBackdropUrl([])).toBeUndefined()
    expect(firstBackdropUrl(0)).toBeUndefined()
    expect(firstBackdropUrl('0')).toBeUndefined()
    expect(firstBackdropUrl(undefined)).toBeUndefined()
  })

  it('pula inválidas e devolve a primeira válida, mantendo a ordem', () => {
    expect(firstBackdropUrl(['', 'http://a.test/1.jpg', 'http://a.test/2.jpg'])).toBe('http://a.test/1.jpg')
  })
})
