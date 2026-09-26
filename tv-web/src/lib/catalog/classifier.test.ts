import { describe, expect, it } from 'vitest'
import { classifyEntry, normalizeIconUrl } from './classifier'
import type { ParsedEntry } from './m3uParser'

function entry(name: string, group?: string, attributes: Record<string, string> = {}): ParsedEntry {
  return { name, url: 'http://exemplo.test/x', group, attributes }
}

describe('classifier', () => {
  it('classifica por palavra-chave do grupo declarado pela fonte', () => {
    expect(classifyEntry(entry('ESPN', 'Canais Esportes')).kind).toBe('channel')
    expect(classifyEntry(entry('Matrix', 'Filmes Ação')).kind).toBe('movie')
    expect(classifyEntry(entry('Alguma Série', 'Séries Suspense')).kind).toBe('series')
  })

  it('reconhece episódio pelo padrão SxxExx e extrai série, temporada e episódio', () => {
    const classified = classifyEntry(entry('Show Ficticio S01E02', 'Séries Comédia'))

    expect(classified.kind).toBe('episode')
    expect(classified.seasonNumber).toBe(1)
    expect(classified.episodeNumber).toBe(2)
    expect(classified.seriesName).toBe('Show Ficticio')
    expect(classified.seriesKey).toBe('show ficticio')
  })

  it('agrupa episódios da mesma série sob a mesma chave', () => {
    const first = classifyEntry(entry('Show Ficticio S01E01', 'Séries Comédia'))
    const second = classifyEntry(entry('Show Ficticio S01E02', 'Séries Comédia'))

    expect(first.seriesKey).toBe(second.seriesKey)
  })

  it('padrão de episódio vence a palavra-chave do grupo', () => {
    // O grupo diz "Filmes", mas o nome tem SxxExx — a evidência mais
    // específica manda, como no backend.
    const classified = classifyEntry(entry('Coisa S02E03', 'Filmes Ação'))
    expect(classified.kind).toBe('episode')
  })

  it('grupo de série sem padrão de episódio vira série avulsa, não episódio inventado', () => {
    const classified = classifyEntry(entry('Serie Sem Padrao De Episodio', 'Series Suspense'))

    expect(classified.kind).toBe('series')
    expect(classified.seriesKey).toBeUndefined()
  })

  it('sem evidência suficiente, marca como não classificado em vez de adivinhar', () => {
    const classified = classifyEntry(entry('Item Sem Grupo Nem Padrao'))

    expect(classified.kind).toBe('unclassified')
    expect(classified.group).toBeUndefined()
  })

  it('preserva o grupo exatamente como a fonte declarou', () => {
    const classified = classifyEntry(entry('Canal X', 'Canais | Variedades'))
    expect(classified.group).toBe('Canais | Variedades')
  })

  describe('normalizeIconUrl (feature 015, D-001b)', () => {
    it('aceita URL válida, com espaço nas bordas', () => {
      expect(normalizeIconUrl('  http://exemplo.test/capa.png  ')).toBe('http://exemplo.test/capa.png')
    })

    it('vazia, só espaço, ausente ou inválida vira undefined, sem lançar', () => {
      expect(normalizeIconUrl('')).toBeUndefined()
      expect(normalizeIconUrl('   ')).toBeUndefined()
      expect(normalizeIconUrl(undefined)).toBeUndefined()
      expect(normalizeIconUrl('não é url')).toBeUndefined()
      expect(normalizeIconUrl(42)).toBeUndefined()
    })
  })

  describe('captura de tvg-logo (feature 015)', () => {
    it('filme e série capturam iconUrl do atributo tvg-logo', () => {
      const movie = classifyEntry(entry('Matrix', 'Filmes Ação', { 'tvg-logo': 'http://exemplo.test/matrix.png' }))
      expect(movie.iconUrl).toBe('http://exemplo.test/matrix.png')

      const series = classifyEntry(entry('Show', 'Séries Suspense', { 'tvg-logo': 'http://exemplo.test/show.png' }))
      expect(series.iconUrl).toBe('http://exemplo.test/show.png')
    })

    it('episódio captura iconUrl (pra série sintética herdar, D-003)', () => {
      const episode = classifyEntry(
        entry('Show S01E01', 'Séries Comédia', { 'tvg-logo': 'http://exemplo.test/ep.png' }),
      )
      expect(episode.iconUrl).toBe('http://exemplo.test/ep.png')
    })

    it('canal NUNCA captura iconUrl, mesmo com tvg-logo declarado (FR-009)', () => {
      const channel = classifyEntry(entry('ESPN', 'Canais Esportes', { 'tvg-logo': 'http://exemplo.test/espn.png' }))
      expect(channel.iconUrl).toBeUndefined()
    })

    it('atributo ausente vira iconUrl undefined', () => {
      const movie = classifyEntry(entry('Matrix', 'Filmes Ação'))
      expect(movie.iconUrl).toBeUndefined()
    })
  })
})
