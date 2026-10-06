import { describe, expect, it } from 'vitest'
import { mapTmdbDetail } from './tmdbMapping'
import { tmdbImageUrl } from './tmdbConnector'

describe('tmdbImageUrl', () => {
  it('usa o tamanho pedido (padrão w1280) e nunca leva chave', () => {
    expect(tmdbImageUrl('/a.jpg')).toBe('https://image.tmdb.org/t/p/w1280/a.jpg')
    expect(tmdbImageUrl('a.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/a.jpg')
  })
})

describe('mapTmdbDetail — série (aggregate_credits)', () => {
  const detail = {
    id: 1,
    name: 'Série',
    aggregate_credits: {
      cast: [
        { id: 11, name: 'Segunda', order: 1, roles: [{ character: 'X', episode_count: 2 }] },
        {
          id: 10,
          name: 'Primeira',
          order: 0,
          profile_path: '/p.jpg',
          roles: [
            { character: 'Menor', episode_count: 1 },
            { character: 'Maior', episode_count: 9 },
          ],
        },
      ],
    },
    videos: { results: [] },
  }

  it('usa o papel de mais episódios e o elenco em texto vem de aggregate_credits, por order', () => {
    const fields = mapTmdbDetail('tv', detail)
    expect(fields.castPeople?.map((p) => [p.personId, p.character])).toEqual([
      [10, 'Maior'],
      [11, 'X'],
    ])
    expect(fields.castPeople?.[0].photoUrl).toContain('/w185/p.jpg')
    expect(fields.cast).toBe('Primeira, Segunda')
  })

  it('similar é [] quando as duas listas vêm vazias ou ausentes', () => {
    expect(mapTmdbDetail('tv', { ...detail, recommendations: { results: [] }, similar: { results: [] } }).similar).toEqual([])
    expect(mapTmdbDetail('tv', detail).similar).toEqual([])
  })

  // Feature 060 (FR-021): o fundo 16:9 já vem na resposta; guardar o caminho não custa requisição e nunca leva chave.
  it('similar guarda o backdrop que já chega (w780, sem chave) e o deixa ausente quando o TMDB não o informa', () => {
    const fields = mapTmdbDetail('tv', {
      ...detail,
      recommendations: {
        results: [
          { id: 200, name: 'Com fundo', first_air_date: '2021-01-01', poster_path: '/p.jpg', backdrop_path: '/b.jpg' },
          { id: 201, name: 'Sem fundo', first_air_date: '2021-01-01', backdrop_path: '   ' },
          { id: 202, name: 'Sem nada' },
        ],
      },
    })
    expect(fields.similar?.[0].backdropUrl).toBe('https://image.tmdb.org/t/p/w780/b.jpg')
    expect(fields.similar?.[0].posterUrl).toContain('/w342/p.jpg')
    expect(fields.similar?.[1].backdropUrl).toBeUndefined()
    expect(fields.similar?.[2].backdropUrl).toBeUndefined()
    expect(JSON.stringify(fields.similar)).not.toMatch(/api_key|Bearer/i)
  })

  it('similar de série: tipo do detalhe, ano de first_air_date, sem repetir nem o próprio id, no máximo 20', () => {
    const results = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: `S${i}`, first_air_date: '2020-01-01', media_type: 'movie' }))
    const fields = mapTmdbDetail('tv', { ...detail, recommendations: { results: [{ id: 1, name: 'Eu' }, ...results] }, similar: { results } })
    expect(fields.similar).toHaveLength(20)
    expect(fields.similar?.[0]).toMatchObject({ tmdbId: 100, kind: 'series', year: 2020 })
    expect(fields.similar?.some((t) => t.tmdbId === 1)).toBe(false)
  })
})
