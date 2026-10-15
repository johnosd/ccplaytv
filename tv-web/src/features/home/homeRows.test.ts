import { describe, expect, it } from 'vitest'
import { HOME_ROW_ORDER, buildHomeRows, type HomeRowKey } from './homeRows'

describe('buildHomeRows (feature 060, FR-018; ordem do ad-hoc 2026-10-09)', () => {
  it('com todos os dados: canais, continuar, Minha Lista, filmes e séries adicionados', () => {
    const all = Object.fromEntries(HOME_ROW_ORDER.map((key) => [key, true])) as Record<HomeRowKey, boolean>
    expect(buildHomeRows(all)).toEqual(['channels', 'continue', 'mylist', 'added-movies', 'added-series'])
  })

  it('fileira sem dado (ou ainda carregando) não existe', () => {
    expect(buildHomeRows({})).toEqual([])
    expect(buildHomeRows({ channels: true, continue: false, mylist: true })).toEqual(['channels', 'mylist'])
  })

  it('a ordem não depende da ordem das chaves do objeto de entrada', () => {
    expect(buildHomeRows({ 'added-series': true, mylist: true, continue: true, channels: true })).toEqual([
      'channels',
      'continue',
      'mylist',
      'added-series',
    ])
  })
})
