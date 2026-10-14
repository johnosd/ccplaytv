import { describe, expect, it } from 'vitest'
import { isAdultCategoryName } from './categoryAccess'

/** Feature 066 (T031, FR-023): lista fixa de termos sobre o nome declarado, sem diferenciar maiúsculas e acentos. */
describe('isAdultCategoryName', () => {
  it.each(['Adultos', 'ADULTO', 'Filmes Adultas', 'XXX', 'xxx Brasil', '+18', 'Canais 18+', '[18] Noite', 'Pornô', 'PORNO HD', 'Erótico', 'Eróticos', 'Erotica', 'Adult Swim', 'Adults Only'])(
    '"%s" é adulto',
    (name) => expect(isAdultCategoryName(name)).toBe(true),
  )

  it.each(['Adulteração', 'Infantil', 'Esportes', '2018', 'Filmes 2018', 'Copa 1890', 'Notícias'])(
    '"%s" não é adulto',
    (name) => expect(isAdultCategoryName(name)).toBe(false),
  )

  it('sem nome não é adulto', () => {
    expect(isAdultCategoryName(undefined)).toBe(false)
    expect(isAdultCategoryName('')).toBe(false)
  })
})
