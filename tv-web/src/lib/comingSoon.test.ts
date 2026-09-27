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

  it('o registro de produção tem exatamente os mocks das features 023/024 — a fixture de teste não vaza para ele', () => {
    delete COMING_SOON[FIXTURE_ID]
    expect(Object.keys(COMING_SOON).sort()).toEqual(['epg-guide', 'pair-phone', 'search-global', 'settings'])
  })

  it('cada mock aponta para um item de backlog ou marco, com mensagem preenchida', () => {
    delete COMING_SOON[FIXTURE_ID]
    for (const [id, entry] of Object.entries(COMING_SOON)) {
      expect(entry.message.trim(), `mensagem de ${id}`).not.toBe('')
      expect(String(entry.backlogItem).trim(), `backlogItem de ${id}`).not.toBe('')
    }
    expect(getComingSoon('pair-phone').backlogItem).toBe(22)
    expect(getComingSoon('search-global').backlogItem).toBe('M6')
    expect(getComingSoon('epg-guide').backlogItem).toBe(42)
  })
})
