import { describe, expect, it } from 'vitest'
import { countryDisplayName } from './countryNames'
import { tvCountryCode } from './tvCountry'

describe('countryDisplayName', () => {
  it('traduz pelo código no idioma do app', () => {
    expect(countryDisplayName('BR', 'pt')).toBe('Brasil')
    expect(countryDisplayName('br', 'en')).toBe('Brazil')
    expect(countryDisplayName('DE', 'es')).toBe('Alemania')
  })

  it('sem tradução, cai no nome do diretório e depois no código', () => {
    expect(countryDisplayName('ZZ', 'pt', 'Zedland')).toBe('Zedland')
    expect(countryDisplayName('ZZ', 'pt')).toBe('ZZ')
    expect(countryDisplayName('', 'pt', 'Nowhere')).toBe('Nowhere')
  })
})

describe('tvCountryCode', () => {
  it('usa a região do primeiro idioma que tiver uma', () => {
    expect(tvCountryCode(['pt-BR'])).toBe('BR')
    expect(tvCountryCode(['en', 'es_MX'])).toBe('MX')
    expect(tvCountryCode(['zh-Hant-TW'])).toBe('TW')
  })

  it('sem região, null', () => {
    expect(tvCountryCode(['pt', 'en'])).toBeNull()
    expect(tvCountryCode([])).toBeNull()
  })

  it('lê o idioma do sistema por padrão', () => {
    expect(tvCountryCode()).toBe('BR') // setupTests.node: pt-BR
  })
})
