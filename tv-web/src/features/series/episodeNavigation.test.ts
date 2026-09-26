import { describe, expect, it } from 'vitest'
import { episodeBadge, groupBySeason, nextEpisode, type EpisodeOut } from './episodeNavigation'
import type { UserStateRecord } from '../../lib/catalog/db'

function episode(overrides: Partial<EpisodeOut> & { id: string }): EpisodeOut {
  return {
    name: `Episódio ${overrides.id}`,
    season_number: 1,
    episode_number: 1,
    playable: true,
    source_id: 'src1',
    provider_stream_id: overrides.id,
    series_id: 'srv-1',
    original_name: `Episódio ${overrides.id}`,
    ...overrides,
  }
}

describe('groupBySeason', () => {
  it('agrupa por temporada em ordem numérica crescente, independente da ordem de chegada', () => {
    const seasons = groupBySeason([
      episode({ id: '1', season_number: 2, episode_number: 1 }),
      episode({ id: '2', season_number: 1, episode_number: 1 }),
    ])

    expect(seasons.map((s) => s.number)).toEqual([1, 2])
    expect(seasons.map((s) => s.label)).toEqual(['Temporada 1', 'Temporada 2'])
  })

  it('dentro da temporada, ordena por episode_number crescente', () => {
    const seasons = groupBySeason([
      episode({ id: '3', episode_number: 3 }),
      episode({ id: '1', episode_number: 1 }),
      episode({ id: '2', episode_number: 2 }),
    ])

    expect(seasons[0].episodes.map((e) => e.id)).toEqual(['1', '2', '3'])
  })

  it('episódio sem episode_number vai depois dos numerados, por id crescente entre si', () => {
    const seasons = groupBySeason([
      episode({ id: '20', episode_number: null }),
      episode({ id: '10', episode_number: null }),
      episode({ id: '5', episode_number: 1 }),
    ])

    expect(seasons[0].episodes.map((e) => e.id)).toEqual(['5', '10', '20'])
  })

  it('temporada nula vira um único grupo "Episódios", sempre por último', () => {
    const seasons = groupBySeason([
      episode({ id: '1', season_number: null, episode_number: null }),
      episode({ id: '2', season_number: 2, episode_number: 1 }),
      episode({ id: '3', season_number: 1, episode_number: 1 }),
    ])

    expect(seasons.map((s) => s.key)).toEqual(['1', '2', 'none'])
    expect(seasons.at(-1)).toMatchObject({ key: 'none', label: 'Episódios', number: null })
    expect(seasons.at(-1)?.episodes.map((e) => e.id)).toEqual(['1'])
  })

  it('temporada sem nenhum episódio não existe — é derivada, não declarada à parte', () => {
    const seasons = groupBySeason([episode({ id: '1', season_number: 1 })])

    expect(seasons).toHaveLength(1)
  })

  it('lista vazia devolve nenhuma temporada', () => {
    expect(groupBySeason([])).toEqual([])
  })
})

describe('nextEpisode (feature 012, D-010, logic §4)', () => {
  it('mesma temporada: devolve o episódio seguinte', () => {
    const seasons = groupBySeason([
      episode({ id: '1', episode_number: 1 }),
      episode({ id: '2', episode_number: 2 }),
      episode({ id: '3', episode_number: 3 }),
    ])

    expect(nextEpisode(seasons, '1')?.id).toBe('2')
    expect(nextEpisode(seasons, '2')?.id).toBe('3')
  })

  it('último episódio da temporada: devolve o primeiro da temporada seguinte', () => {
    const seasons = groupBySeason([
      episode({ id: '1', season_number: 1, episode_number: 1 }),
      episode({ id: '2', season_number: 2, episode_number: 1 }),
      episode({ id: '3', season_number: 2, episode_number: 2 }),
    ])

    expect(nextEpisode(seasons, '1')?.id).toBe('2')
  })

  it('último episódio da última temporada: não há próximo (FR-016)', () => {
    const seasons = groupBySeason([
      episode({ id: '1', season_number: 1, episode_number: 1 }),
      episode({ id: '2', season_number: 2, episode_number: 1 }),
    ])

    expect(nextEpisode(seasons, '2')).toBeNull()
  })

  it('id desconhecido: não há próximo, sem lançar', () => {
    const seasons = groupBySeason([episode({ id: '1' })])
    expect(nextEpisode(seasons, 'inexistente')).toBeNull()
  })

  it('lista de temporadas vazia: não há próximo', () => {
    expect(nextEpisode([], '1')).toBeNull()
  })
})

function userState(overrides: Partial<UserStateRecord> = {}): UserStateRecord {
  return { stableId: 'x', sourceId: 'src1', isFavorite: false, createdAt: 0, updatedAt: 0, ...overrides }
}

describe('episodeBadge (feature 012, D-007, logic §5)', () => {
  it('nunca aberto (ausente): não assistido, sem retomada', () => {
    expect(episodeBadge(undefined)).toEqual({ watched: false, resumeSeconds: null })
    expect(episodeBadge(null)).toEqual({ watched: false, resumeSeconds: null })
  })

  it('em andamento (progresso salvo, sem completedAt): não assistido, com retomada — distinto de concluído', () => {
    const badge = episodeBadge(userState({ progressSeconds: 90 }))
    expect(badge.watched).toBe(false)
    expect(badge.resumeSeconds).toBe(90)
  })

  it('concluído (completedAt, sem progressSeconds): assistido, sem retomada', () => {
    const badge = episodeBadge(userState({ completedAt: 1000 }))
    expect(badge.watched).toBe(true)
    expect(badge.resumeSeconds).toBeNull()
  })

  it('reassistindo um concluído (completedAt E progressSeconds): os dois convivem (D-007)', () => {
    const badge = episodeBadge(userState({ completedAt: 1000, progressSeconds: 40 }))
    expect(badge.watched).toBe(true)
    expect(badge.resumeSeconds).toBe(40)
  })

  it('progresso abaixo do limiar de retomada não conta como "em andamento" pra exibição', () => {
    const badge = episodeBadge(userState({ progressSeconds: 5 }))
    expect(badge.resumeSeconds).toBeNull()
  })
})
