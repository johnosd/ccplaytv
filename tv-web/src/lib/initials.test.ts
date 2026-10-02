import { describe, expect, it } from 'vitest'
import { listInitials } from './initials'

describe('listInitials', () => {
  it('duas palavras: a inicial de cada uma', () => {
    expect(listInitials('Telecine Premium')).toBe('TP')
  })

  it('uma palavra: as duas primeiras letras, com acento preservado', () => {
    expect(listInitials('Notícias')).toBe('NO')
    expect(listInitials('Ágata')).toBe('ÁG')
  })

  it('emoji não é partido ao meio', () => {
    expect(listInitials('🎬 Cinema')).toBe('🎬C')
  })

  it('vazio ou só espaços → vazio', () => {
    expect(listInitials('')).toBe('')
    expect(listInitials('   ')).toBe('')
  })
})
