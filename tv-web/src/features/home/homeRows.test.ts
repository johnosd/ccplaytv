import { describe, expect, it } from 'vitest'
import { HOME_ROW_ORDER, buildHomeRows, type HomeRowKey } from './homeRows'

describe('buildHomeRows (feature 060, FR-018)', () => {
  it('com todos os dados, a ordem é a da spec e a Curadoria por IA fecha a lista', () => {
    const all = Object.fromEntries(HOME_ROW_ORDER.map((key) => [key, true])) as Record<HomeRowKey, boolean>
    expect(buildHomeRows(all)).toEqual([
      'continue',
      'top10-movies',
      'added-movies',
      'tip-movies',
      'because',
      'channels',
      'mylist',
      'top10-series',
      'added-series',
      'tip-series',
      'ai',
    ])
  })

  it('fileira sem dado (ou ainda carregando) não existe; só a Curadoria por IA é sempre presente', () => {
    expect(buildHomeRows({})).toEqual(['ai'])
    expect(buildHomeRows({ channels: true, because: false, mylist: true })).toEqual(['channels', 'mylist', 'ai'])
  })

  it('a ordem não depende da ordem das chaves do objeto de entrada', () => {
    expect(buildHomeRows({ mylist: true, continue: true, 'top10-series': true })).toEqual(['continue', 'mylist', 'top10-series', 'ai'])
  })
})
