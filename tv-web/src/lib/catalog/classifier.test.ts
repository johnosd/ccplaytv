import { describe, expect, it } from 'vitest'
import { classifyEntry, normalizeAddedAt, normalizeDurationSeconds, normalizeIconUrl, normalizeYear } from './classifier'
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

    it('canal captura iconUrl de tvg-logo (feature 024, R-003 — inverte a exclusão original da 015)', () => {
      const channel = classifyEntry(entry('ESPN', 'Canais Esportes', { 'tvg-logo': 'http://exemplo.test/espn.png' }))
      expect(channel.iconUrl).toBe('http://exemplo.test/espn.png')
    })

    it('atributo ausente vira iconUrl undefined', () => {
      const movie = classifyEntry(entry('Matrix', 'Filmes Ação'))
      expect(movie.iconUrl).toBeUndefined()
    })
  })

  // Feature 025 (T004, T016) — `logic/metadados-vod.md` §1.
  describe('normalizeYear', () => {
    const NOW = new Date('2026-09-27T00:00:00Z').getTime()

    it('aceita número, string de 4 dígitos e data completa/parcial', () => {
      expect(normalizeYear(2019, NOW)).toBe(2019)
      expect(normalizeYear('2019', NOW)).toBe(2019)
      expect(normalizeYear('2019-06-01', NOW)).toBe(2019)
      expect(normalizeYear('2019-06', NOW)).toBe(2019)
    })

    it('data parcial sem dia, epoch 0 como string e lixo viram ausência', () => {
      expect(normalizeYear('0', NOW)).toBeUndefined()
      expect(normalizeYear('N/A', NOW)).toBeUndefined()
      expect(normalizeYear('ano passado', NOW)).toBeUndefined()
      expect(normalizeYear(undefined, NOW)).toBeUndefined()
      expect(normalizeYear(null, NOW)).toBeUndefined()
    })

    it('fora da faixa plausível (antes de 1888, ou futuro distante) vira ausência', () => {
      expect(normalizeYear('1700', NOW)).toBeUndefined()
      expect(normalizeYear('1887', NOW)).toBeUndefined()
      expect(normalizeYear('1888', NOW)).toBe(1888)
      expect(normalizeYear(2030, NOW)).toBeUndefined() // corrente (2026) + 1 = 2027 é o teto
      expect(normalizeYear(2027, NOW)).toBe(2027)
    })

    it('nunca procura ano dentro de texto livre (título)', () => {
      expect(normalizeYear('Filme C (2012)', NOW)).toBeUndefined()
    })
  })

  describe('normalizeAddedAt', () => {
    const NOW = new Date('2026-09-27T00:00:00Z').getTime()

    it('aceita epoch em segundos, número ou string, e converte para ms', () => {
      expect(normalizeAddedAt('1700000000', NOW)).toBe(1_700_000_000_000)
      expect(normalizeAddedAt(1_700_000_000, NOW)).toBe(1_700_000_000_000)
    })

    it('"0", negativo, texto e futuro distante viram ausência', () => {
      expect(normalizeAddedAt('0', NOW)).toBeUndefined()
      expect(normalizeAddedAt(-100, NOW)).toBeUndefined()
      expect(normalizeAddedAt('ontem', NOW)).toBeUndefined()
      expect(normalizeAddedAt(Math.floor(NOW / 1000) + 60 * 60 * 24 * 30, NOW)).toBeUndefined()
      expect(normalizeAddedAt(undefined, NOW)).toBeUndefined()
    })

    it('antes de 2000-01-01 vira ausência', () => {
      expect(normalizeAddedAt('900000000', NOW)).toBeUndefined() // 1998
    })
  })

  describe('normalizeDurationSeconds', () => {
    it('aceita número ou string de dígitos, segundos inteiros positivos', () => {
      expect(normalizeDurationSeconds(5400)).toBe(5400)
      expect(normalizeDurationSeconds('5400')).toBe(5400)
    })

    it('zero, negativo, 24h ou mais, texto e ausente viram ausência', () => {
      expect(normalizeDurationSeconds(0)).toBeUndefined()
      expect(normalizeDurationSeconds(-1)).toBeUndefined()
      expect(normalizeDurationSeconds(24 * 60 * 60)).toBeUndefined()
      expect(normalizeDurationSeconds('lixo')).toBeUndefined()
      expect(normalizeDurationSeconds(undefined)).toBeUndefined()
    })
  })
})
