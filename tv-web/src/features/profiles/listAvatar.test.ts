import { describe, expect, it } from 'vitest'
import { LIST_AVATAR_VARIANTS, listAvatarVariant, listInitials } from './listAvatar'

// Casos além do contrato (feature 037, logic/avatar-da-lista.md).
describe('listInitials', () => {
  it('vários espaços internos contam como um separador', () => {
    expect(listInitials('Minha    Lista')).toBe('ML')
    expect(listInitials('Lista\t2')).toBe('L2')
  })

  it('emoji no início não é partido ao meio (code point, não UTF-16)', () => {
    expect(listInitials('🎬 Filmes')).toBe('🎬F')
    expect(listInitials('🎬🍿')).toBe('🎬🍿')
  })

  it('nome vazio ou só espaços → string vazia, sem erro', () => {
    expect(listInitials('')).toBe('')
    expect(listInitials('   ')).toBe('')
  })
})

describe('listAvatarVariant', () => {
  it('id vazio → índice válido', () => {
    const variant = listAvatarVariant('')
    expect(Number.isInteger(variant)).toBe(true)
    expect(variant).toBeGreaterThanOrEqual(0)
    expect(variant).toBeLessThan(LIST_AVATAR_VARIANTS)
  })

  it('depende só do id: o mesmo id em chamadas separadas dá o mesmo índice', () => {
    expect(listAvatarVariant('a8f3c1-9b2e')).toBe(listAvatarVariant('a8f3c1-9b2e'))
  })
})
