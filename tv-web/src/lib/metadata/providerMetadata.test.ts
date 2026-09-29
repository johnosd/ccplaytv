import { describe, expect, it } from 'vitest'
import { normalizeSeriesInfo, normalizeVodInfo } from './providerMetadata'

describe('normalizeVodInfo (formatos medidos no painel real)', () => {
  it('lê os campos de um get_vod_info completo, com backdrop_path em lista', () => {
    const { fields, tmdbId } = normalizeVodInfo({
      tmdb_id: 1212763,
      plot: 'Sinopse.',
      genre: 'Terror',
      director: 'Fulano',
      cast: 'A, B',
      country: 'United States of America',
      duration_secs: 6631,
      backdrop_path: ['http://img.test/bd.jpg'],
    })
    expect(fields).toEqual({
      synopsis: 'Sinopse.',
      backdropUrl: 'http://img.test/bd.jpg',
      genres: 'Terror',
      director: 'Fulano',
      cast: 'A, B',
      country: 'United States of America',
      durationSeconds: 6631,
    })
    expect(tmdbId).toBe(1212763)
  })

  it('usa description quando não há plot, actors quando não há cast, e backdrop_path em string', () => {
    const { fields } = normalizeVodInfo({ description: 'Texto.', actors: 'X, Y', backdrop_path: 'http://img.test/b.jpg' })
    expect(fields).toMatchObject({ synopsis: 'Texto.', cast: 'X, Y', backdropUrl: 'http://img.test/b.jpg' })
  })

  it('duração: duration_secs → "HH:MM:SS" → episode_run_time em minutos', () => {
    expect(normalizeVodInfo({ duration: '01:50:31' }).fields.durationSeconds).toBe(6631)
    expect(normalizeVodInfo({ episode_run_time: 117 }).fields.durationSeconds).toBe(7020)
    expect(normalizeVodInfo({ duration_secs: 100, duration: '02:00:00' }).fields.durationSeconds).toBe(100)
  })

  it('vazio, "0", lista vazia, URL inválida e tmdb_id inválido são ausentes — nunca valor de preenchimento', () => {
    const { fields, tmdbId } = normalizeVodInfo({
      plot: '  ',
      genre: '0',
      director: '',
      cast: 5,
      backdrop_path: [],
      duration_secs: 0,
      duration: 'não é hora',
      tmdb_id: 0,
    })
    expect(fields).toEqual({})
    expect(tmdbId).toBeUndefined()
    expect(normalizeVodInfo({ backdrop_path: ['não é url'] }).fields.backdropUrl).toBeUndefined()
  })

  it('info ausente devolve vazio', () => {
    expect(normalizeVodInfo(undefined)).toEqual({ fields: {} })
  })
})

describe('normalizeSeriesInfo', () => {
  it('duração é por episódio (episode_run_time em minutos, string) e não há país nem tmdb_id', () => {
    const result = normalizeSeriesInfo({
      plot: 'Uma série.',
      cast: 'A, B',
      director: 'D',
      genre: 'Animação, Drama',
      episode_run_time: '25',
      backdrop_path: ['http://img.test/s.jpg'],
      country: 'Japão',
      tmdb_id: 99,
    })
    expect(result.fields).toEqual({
      synopsis: 'Uma série.',
      cast: 'A, B',
      director: 'D',
      genres: 'Animação, Drama',
      durationSeconds: 1500,
      backdropUrl: 'http://img.test/s.jpg',
    })
    expect(result.tmdbId).toBeUndefined()
  })
})
