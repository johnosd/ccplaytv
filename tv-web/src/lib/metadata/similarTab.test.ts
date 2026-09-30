import { describe, expect, it } from 'vitest'
import { similarTabStatus } from './similarTab'
import type { TitleMetadataView, TmdbState } from './types'

const ref = { tmdbId: 1, kind: 'movie' as const, title: 'A' }

function status(tmdbState: TmdbState | undefined, metadata: TitleMetadataView | undefined, resolving = false) {
  return similarTabStatus({ tmdbState, metadata, resolving })
}

describe('similarTabStatus — tabela de estados de logic/aba-semelhantes.md §1', () => {
  it('sem chave → no_key, mesmo com metadata ainda por chegar', () => {
    expect(status('not_configured', undefined)).toBe('no_key')
    expect(status('not_configured', {})).toBe('no_key')
  })

  it('metadata ainda não chegou → loading', () => {
    expect(status('connected', undefined)).toBe('loading')
  })

  it('matched: sem a chave similar → loading; lista vazia → empty; resolvendo → loading; pronta → ready', () => {
    expect(status('connected', { tmdbMatch: 'matched' })).toBe('loading')
    expect(status('connected', { tmdbMatch: 'matched', similar: [] })).toBe('empty')
    expect(status('connected', { tmdbMatch: 'matched', similar: [ref] }, true)).toBe('loading')
    expect(status('connected', { tmdbMatch: 'matched', similar: [ref] })).toBe('ready')
  })

  it('no_match e dead_id → no_match', () => {
    expect(status('connected', { tmdbMatch: 'no_match' })).toBe('no_match')
    expect(status('connected', { tmdbMatch: 'dead_id' })).toBe('no_match')
  })

  it('sem resultado do TMDB: serviço ruim → unavailable; conectado → loading (consulta em voo)', () => {
    for (const state of ['refused', 'offline', 'rate_limited'] as const) {
      expect(status(state, {})).toBe('unavailable')
    }
    expect(status('connected', {})).toBe('loading')
  })

  it('dado já guardado vence estado ruim do serviço: matched em cache com o TMDB offline → ready', () => {
    expect(status('offline', { tmdbMatch: 'matched', similar: [ref] })).toBe('ready')
    expect(status('refused', { tmdbMatch: 'no_match' })).toBe('no_match')
  })
})
