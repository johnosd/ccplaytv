import { describe, expect, it } from 'vitest'
import { classifyEntry } from './classifier'
import type { ParsedEntry } from './m3uParser'

function entry(name: string, group?: string): ParsedEntry {
  return { name, url: 'http://exemplo.test/x', group, attributes: {} }
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
})
