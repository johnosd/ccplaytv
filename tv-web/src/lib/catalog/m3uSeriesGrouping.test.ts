import { describe, expect, it } from 'vitest'
import { createSeriesGrouper } from './m3uSeriesGrouping'
import type { MappedChannel } from './xtreamConnector'

function episode(overrides: Partial<MappedChannel> = {}): MappedChannel {
  return {
    kind: 'episode',
    name: 'Breaking Bad S01E01',
    originalName: 'Breaking Bad S01E01',
    group: 'Series | Disney Plus',
    groupOrder: 0,
    seriesKey: 'breaking bad',
    seriesName: 'Breaking Bad',
    seasonNumber: 1,
    episodeNumber: 1,
    ...overrides,
  }
}

describe('createSeriesGrouper (feature 012, D-003)', () => {
  it('mesma chave (grupo + título-base) produz o mesmo seriesId, série emitida só na primeira vez', () => {
    const grouper = createSeriesGrouper()

    const first = grouper.assign(episode({ episodeNumber: 1 }))
    const second = grouper.assign(episode({ episodeNumber: 2 }))

    expect(first.series).toBeDefined()
    expect(first.episode.seriesId).toBe(second.episode.seriesId)
    expect(second.series).toBeUndefined()
  })

  it('a série sintética usa seriesName/name da entrada que a criou, e o grupo/ordem da fonte', () => {
    const grouper = createSeriesGrouper()

    const { series } = grouper.assign(episode())

    expect(series).toMatchObject({
      kind: 'series',
      name: 'Breaking Bad',
      originalName: 'Breaking Bad',
      group: 'Series | Disney Plus',
      groupOrder: 0,
    })
    expect(series?.seriesId).toBe(series && grouper.assign(episode()).episode.seriesId)
  })

  it('grupo diferente com o mesmo título-base é uma série diferente (chave inclui o grupo)', () => {
    const grouper = createSeriesGrouper()

    const a = grouper.assign(episode({ group: 'Grupo A' }))
    const b = grouper.assign(episode({ group: 'Grupo B' }))

    expect(a.episode.seriesId).not.toBe(b.episode.seriesId)
    expect(b.series).toBeDefined()
  })

  it('sem seriesKey (Modo limitado, tipo vindo da URL — D-012), usa o nome normalizado', () => {
    const grouper = createSeriesGrouper()

    const first = grouper.assign(episode({ seriesKey: undefined, seriesName: undefined, name: '  Foo Bar  ' }))
    const second = grouper.assign(episode({ seriesKey: undefined, seriesName: undefined, name: 'foo bar' }))

    expect(first.episode.seriesId).toBe(second.episode.seriesId)
    expect(second.series).toBeUndefined()
    expect(first.series?.name).toBe('  Foo Bar  ') // sem seriesName, cai no name cru da primeira entrada
  })

  it('duas séries M3U de fontes diferentes nunca colidem — a chave não inclui a fonte de propósito (quem chama usa um grouper por fonte)', () => {
    // A garantia de "por fonte" vem de `consumeM3u` criar um `createSeriesGrouper()`
    // novo a cada importação (uma por fonte) — este teste documenta que o
    // grouper em si não tem noção de fonte, então reusar a mesma instância
    // entre fontes seria o erro a evitar (import-time, não deste módulo).
    const grouper = createSeriesGrouper()
    const first = grouper.assign(episode())
    expect(first.series?.seriesId).toMatch(/^m3u:/)
  })

  it('série sintética herda iconUrl do primeiro episódio da chave (feature 015, D-003)', () => {
    const grouper = createSeriesGrouper()

    const { series } = grouper.assign(episode({ iconUrl: 'http://exemplo.test/ep1.png' }))
    expect(series?.iconUrl).toBe('http://exemplo.test/ep1.png')
  })

  it('episódio seguinte com iconUrl diferente não altera a série já criada (feature 015, D-003)', () => {
    const grouper = createSeriesGrouper()

    grouper.assign(episode({ episodeNumber: 1, iconUrl: 'http://exemplo.test/ep1.png' }))
    const second = grouper.assign(episode({ episodeNumber: 2, iconUrl: 'http://exemplo.test/ep2.png' }))

    expect(second.series).toBeUndefined() // série não é reemitida
    expect(second.episode.iconUrl).toBe('http://exemplo.test/ep2.png') // o episódio em si mantém a própria capa
  })

  it('primeiro episódio sem iconUrl faz a série sintética também ficar sem capa', () => {
    const grouper = createSeriesGrouper()

    const { series } = grouper.assign(episode({ iconUrl: undefined }))
    expect(series?.iconUrl).toBeUndefined()
  })
})
