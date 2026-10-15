/**
 * Teste de CONTRATO da feature 060 — semente de "Porque você assistiu X" (FR-014). Travado em
 * `sdd/specs/060-home-vitrine-expandida/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import type { UserStateRecord } from './db'
import { buildStableId } from './userStateRepository'
import { pickBecauseSeed } from './becauseSeed'

const SOURCE = 'src-a'
const movie = (id: string, source = SOURCE) => buildStableId({ sourceId: source, kind: 'movie', providerStreamId: id })
const episode = (id: string, season: number, ep: number) =>
  buildStableId({ sourceId: SOURCE, kind: 'episode', providerStreamId: id, seasonNumber: season, episodeNumber: ep })

function state(stableId: string, over: Partial<UserStateRecord> = {}): UserStateRecord {
  return { stableId, sourceId: stableId.split('|')[0], isFavorite: false, createdAt: 0, updatedAt: 0, ...over }
}

const SERIES_OF: Record<string, string> = { [episode('e1', 1, 1)]: 'serie-1', [episode('e2', 2, 3)]: 'serie-2' }
const seriesIdOfEpisode = (stableId: string) => SERIES_OF[stableId]

describe('pickBecauseSeed — contrato da feature 060', () => {
  // FR-014, US3/AC2, US3/AC3; edge case "semente removida do Histórico"; Constitution: "IA e Classificação Nunca Inventam Dados"
  it('escolhe o concluído mais recente da fonte e do tipo pedido; episódio vira a série; ignora o não concluído, o de outra fonte, o tirado do Histórico e o episódio sem série conhecida', () => {
    const states: UserStateRecord[] = [
      state(movie('m-old'), { completedAt: 100, lastWatched: 100 }),
      state(movie('m-new'), { completedAt: 500, lastWatched: 500 }),
      // Em andamento, mais recente que todos: não é "concluído".
      state(movie('m-progress'), { progressSeconds: 900, lastWatched: 9000 }),
      // Concluído depois, mas de outra fonte.
      state(movie('m-other', 'src-b'), { completedAt: 9000, lastWatched: 9000 }),
      // Concluído e depois tirado do Histórico (sem reprodução nova): não serve de semente.
      state(movie('m-hidden'), { completedAt: 800, lastWatched: 800, historyHiddenAt: 850 }),
      // Episódio concluído: a semente é a série dele.
      state(episode('e1', 1, 1), { completedAt: 300, lastWatched: 300 }),
      state(episode('e2', 2, 3), { completedAt: 700, lastWatched: 700 }),
      // Episódio cuja série o aparelho não conhece: ignorado, nunca adivinhado.
      state(episode('e-unknown', 1, 2), { completedAt: 950, lastWatched: 950 }),
    ]
    const pick = (kind: 'movie' | 'series' | 'any') => pickBecauseSeed(states, { sourceId: SOURCE, kind, seriesIdOfEpisode })

    expect(pick('any')).toEqual({ kind: 'series', seriesId: 'serie-2' }) // 700 > 500
    expect(pick('movie')).toEqual({ kind: 'movie', stableId: movie('m-new') })
    expect(pick('series')).toEqual({ kind: 'series', seriesId: 'serie-2' })

    // Reproduzido de novo depois de tirado do Histórico: volta a valer (lastWatched > historyHiddenAt).
    const replayed = [...states, state(movie('m-back'), { completedAt: 990, lastWatched: 999, historyHiddenAt: 990 })]
    expect(pickBecauseSeed(replayed, { sourceId: SOURCE, kind: 'any', seriesIdOfEpisode })).toEqual({ kind: 'movie', stableId: movie('m-back') })

    // Nada concluído: sem semente (a fileira não existe).
    expect(pickBecauseSeed([state(movie('x'), { progressSeconds: 60, lastWatched: 1 })], { sourceId: SOURCE, kind: 'any', seriesIdOfEpisode })).toBeNull()
    expect(pickBecauseSeed([], { sourceId: SOURCE, kind: 'movie', seriesIdOfEpisode })).toBeNull()
  })
})
