/**
 * Contrato da feature 033 (trailers) — travado em
 * `sdd/specs/033-trailers-filmes-series/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/sessao-de-trailer.md`.
 */
import { describe, expect, it } from 'vitest'
import { TRAILER_START_TIMEOUT_MS, reduceTrailerSession, startTrailerSession } from './trailerSession'

const T0 = 1_000

describe('trailerSession — contrato da feature 033', () => {
  // FR-017 (próximo candidato UMA vez), FR-018 (15 s), FR-019 ("Tentar de novo" só onde resolve), US3/AC3-AC4
  it('vídeo bloqueado tenta o próximo uma vez só; 153 não troca de candidato e admite nova tentativa; prazo vira TRL-TEMPO; sem rede já abre em erro; tocando ignora o prazo e o fim fecha', () => {
    let s = startTrailerSession({ candidateCount: 3, now: T0, online: true })
    expect(s).toMatchObject({ phase: 'loading', candidateIndex: 0, deadline: T0 + TRAILER_START_TIMEOUT_MS })

    s = reduceTrailerSession(s, { type: 'player-error', code: 150 })
    expect(s).toMatchObject({ phase: 'loading', candidateIndex: 1 })

    s = reduceTrailerSession(s, { type: 'player-error', code: 101 })
    expect(s.phase).toBe('error')
    expect(s.candidateIndex).toBe(1)
    expect(s.error).toEqual({ code: 'YT-101', retryable: false })

    let c = startTrailerSession({ candidateCount: 2, now: T0, online: true })
    c = reduceTrailerSession(c, { type: 'player-error', code: 153 })
    expect(c).toMatchObject({ phase: 'error', candidateIndex: 0, error: { code: 'YT-153', retryable: true } })
    c = reduceTrailerSession(c, { type: 'retry', now: T0 + 20_000 })
    expect(c).toMatchObject({ phase: 'loading', candidateIndex: 0, deadline: T0 + 20_000 + TRAILER_START_TIMEOUT_MS })
    c = reduceTrailerSession(c, { type: 'timeout' })
    expect(c.phase).toBe('error')
    expect(c.error).toEqual({ code: 'TRL-TEMPO', retryable: true })

    const offline = startTrailerSession({ candidateCount: 1, now: T0, online: false })
    expect(offline.phase).toBe('error')
    expect(offline.error).toEqual({ code: 'TRL-REDE', retryable: true })

    let only = startTrailerSession({ candidateCount: 1, now: T0, online: true })
    only = reduceTrailerSession(only, { type: 'player-error', code: 100 })
    expect(only.phase).toBe('error')
    expect(only.error).toEqual({ code: 'YT-100', retryable: false })

    let p = startTrailerSession({ candidateCount: 1, now: T0, online: true })
    p = reduceTrailerSession(p, { type: 'bridge-state', state: 'playing' })
    p = reduceTrailerSession(p, { type: 'timeout' })
    expect(p.phase).toBe('playing')
    p = reduceTrailerSession(p, { type: 'bridge-state', state: 'paused' })
    expect(p.phase).toBe('paused')
    p = reduceTrailerSession(p, { type: 'bridge-state', state: 'ended' })
    expect(p.phase).toBe('closed')
  })
})
