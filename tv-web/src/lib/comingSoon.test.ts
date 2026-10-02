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

  it('o registro de produção tem exatamente os mocks das features 023/024/025/026/027 (menos os que a 029, a 030, a 031 e a 032 tornaram reais) — a fixture de teste não vaza para ele', () => {
    delete COMING_SOON[FIXTURE_ID]
    expect(Object.keys(COMING_SOON).sort()).toEqual([
      'a11y-high-contrast',
      'a11y-subtitles',
      'a11y-voice-guide',
      'dock-ai',
      'dock-speedtest',
      'dock-weather',
      'home-ai-curation',
      'home-trailer',
      'pair-phone',
      'settings-parental',
      'voice-search',
    ])
  })

  it('cada mock aponta para um item de backlog ou marco, com mensagem preenchida', () => {
    delete COMING_SOON[FIXTURE_ID]
    for (const [id, entry] of Object.entries(COMING_SOON)) {
      expect(entry.message.trim(), `mensagem de ${id}`).not.toBe('')
      expect(String(entry.backlogItem).trim(), `backlogItem de ${id}`).not.toBe('')
    }
    expect(getComingSoon('pair-phone').backlogItem).toBe(22)
    expect(() => getComingSoon('epg-guide')).toThrow() // deixou de ser mock na 031
    expect(() => getComingSoon('dock-tmdb')).toThrow() // deixou de ser mock na 032 (ícone real do dock)
    expect(() => getComingSoon('settings-integrations')).toThrow() // deixou de ser mock na 032 (aba real)
    expect(() => getComingSoon('cast')).toThrow() // deixou de ser mock na 032 (aba Elenco com o elenco em texto)
    expect(() => getComingSoon('trailer')).toThrow() // deixou de ser mock na 033 (botão real)
    expect(() => getComingSoon('similar')).toThrow() // deixou de ser mock na 035 (aba Semelhantes real)
    expect(() => getComingSoon('player-quality')).toThrow() // deixou de ser mock na 041 (Qualidade real)
    expect(() => getComingSoon('player-aspect')).toThrow() // deixou de ser mock na 041 (Aspecto real)
    expect(() => getComingSoon('player-speed')).toThrow() // 041, D-001: Velocidade saiu de vez, nem como mock
    expect(() => getComingSoon('settings-player')).toThrow() // deixou de ser mock na 041 (aba Player real)
    expect(getComingSoon('home-ai-curation').backlogItem).toBe(30)
  })
})
