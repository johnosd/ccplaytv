import { describe, expect, it } from 'vitest'
import { LIST_AVATAR_VARIANTS, listAvatarVariant, listInitials } from './listAvatar'

describe('listAvatar — contrato da feature 037', () => {
  // FR-005 + Edge Cases "Iniciais"; logic/avatar-da-lista.md
  it('iniciais seguem as regras do nome e o par de cores é estável por id, dentro do intervalo, e não constante (FR-005)', () => {
    expect(listInitials('Sala')).toBe('SA')
    expect(listInitials('Minha Lista Principal')).toBe('ML')
    expect(listInitials('  família  ')).toBe('FA')
    expect(listInitials('ótima lista')).toBe('ÓL')
    expect(listInitials('123')).toBe('12')
    expect(listInitials('X')).toBe('X')

    const ids = ['sala', 'quarto', 'src-1', 'src-2', 'a8f3c1', 'lista-e2e-um', 'lista-e2e-dois', 'z']
    const variants = ids.map((id) => listAvatarVariant(id))
    for (const variant of variants) {
      expect(Number.isInteger(variant)).toBe(true)
      expect(variant).toBeGreaterThanOrEqual(0)
      expect(variant).toBeLessThan(LIST_AVATAR_VARIANTS)
    }
    // Estável: o mesmo id dá sempre o mesmo par.
    expect(ids.map((id) => listAvatarVariant(id))).toEqual(variants)
    // Não constante: listas diferentes não caem todas no mesmo par.
    expect(new Set(variants).size).toBeGreaterThan(1)
  })
})
