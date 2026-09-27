import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COMING_SOON, getComingSoon } from './comingSoon'

const FIXTURE_ID = 'fixture-teste'

beforeEach(() => {
  COMING_SOON[FIXTURE_ID] = { message: 'Esta função ainda não foi construída.', backlogItem: 99 }
})

afterEach(() => {
  delete COMING_SOON[FIXTURE_ID]
})

describe('getComingSoon', () => {
  it('id registrado retorna a entrada', () => {
    expect(getComingSoon(FIXTURE_ID)).toEqual({
      message: 'Esta função ainda não foi construída.',
      backlogItem: 99,
    })
  })

  it('id ausente lança com o id no texto do erro', () => {
    expect(() => getComingSoon('id-inexistente')).toThrow(/id-inexistente/)
  })

  it('o registro de produção nasce vazio — a fixture de teste não vaza para ele', () => {
    delete COMING_SOON[FIXTURE_ID]
    expect(Object.keys(COMING_SOON)).toEqual([])
  })
})
