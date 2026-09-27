import { describe, expect, it } from 'vitest'
import { getComingSoon } from './comingSoon'

describe('getComingSoon', () => {
  it('id registrado retorna a entrada', () => {
    expect(getComingSoon('exemplo-onda-2')).toEqual({
      message: 'Esta função ainda não foi construída.',
      backlogItem: 15,
    })
  })

  it('id ausente lança com o id no texto do erro', () => {
    expect(() => getComingSoon('id-inexistente')).toThrow(/id-inexistente/)
  })
})
