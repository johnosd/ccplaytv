import { describe, expect, it } from 'vitest'
import {
  TRAILER_START_TIMEOUT_MS,
  reduceTrailerSession,
  startTrailerSession,
  trailerErrorMessage,
  type TrailerSessionState,
} from './trailerSession'

const T0 = 1_000
const start = (candidateCount = 2): TrailerSessionState => startTrailerSession({ candidateCount, now: T0, online: true })

describe('reduceTrailerSession', () => {
  it('bridge-state alterna entre tocando e pausado; ended fecha', () => {
    let s = reduceTrailerSession(start(), { type: 'bridge-state', state: 'playing' })
    expect(s.phase).toBe('playing')
    s = reduceTrailerSession(s, { type: 'bridge-state', state: 'paused' })
    expect(s.phase).toBe('paused')
    s = reduceTrailerSession(s, { type: 'bridge-state', state: 'playing' })
    expect(s.phase).toBe('playing')
    expect(reduceTrailerSession(s, { type: 'bridge-state', state: 'ended' }).phase).toBe('closed')
  })

  it('close fecha de qualquer fase e closed é terminal', () => {
    for (const phase of ['loading', 'playing', 'paused'] as const) {
      const s = { ...start(), phase }
      expect(reduceTrailerSession(s, { type: 'close' }).phase).toBe('closed')
    }
    const closed = reduceTrailerSession(start(), { type: 'close' })
    expect(reduceTrailerSession(closed, { type: 'bridge-state', state: 'playing' })).toBe(closed)
    expect(reduceTrailerSession(closed, { type: 'retry', now: T0 })).toBe(closed)
  })

  it('bridge-failed vira TRL-PONTE com nova tentativa', () => {
    const s = reduceTrailerSession(start(), { type: 'bridge-failed' })
    expect(s).toMatchObject({ phase: 'error', error: { code: 'TRL-PONTE', retryable: true } })
  })

  it('a troca de candidato herda o prazo original (FR-018)', () => {
    const s = reduceTrailerSession(start(), { type: 'player-error', code: 100 })
    expect(s).toMatchObject({ phase: 'loading', candidateIndex: 1, fallbackUsed: true, deadline: T0 + TRAILER_START_TIMEOUT_MS })
  })

  it.each([100, 101, 150, 2])('código %i sem reserva vira erro sem nova tentativa', (code) => {
    const s = reduceTrailerSession(start(1), { type: 'player-error', code })
    expect(s.error).toEqual({ code: `YT-${code}`, retryable: false })
  })

  it('5 e códigos desconhecidos não trocam de candidato e admitem nova tentativa', () => {
    for (const code of [5, 153, 999]) {
      const s = reduceTrailerSession(start(), { type: 'player-error', code })
      expect(s).toMatchObject({ phase: 'error', candidateIndex: 0, error: { code: `YT-${code}`, retryable: true } })
    }
  })

  it('eventos do iframe velho depois do erro são ignorados', () => {
    const errored = reduceTrailerSession(start(), { type: 'player-error', code: 153 })
    expect(reduceTrailerSession(errored, { type: 'bridge-state', state: 'playing' })).toBe(errored)
    expect(reduceTrailerSession(errored, { type: 'player-error', code: 100 })).toBe(errored)
    expect(reduceTrailerSession(errored, { type: 'bridge-failed' })).toBe(errored)
    expect(reduceTrailerSession(errored, { type: 'timeout' })).toBe(errored)
  })

  it('retry em erro não retryable não muda nada', () => {
    const errored = reduceTrailerSession(start(1), { type: 'player-error', code: 150 })
    expect(reduceTrailerSession(errored, { type: 'retry', now: T0 + 5 })).toBe(errored)
  })

  it('retry mantém fallbackUsed (a única troca já foi gasta)', () => {
    let s = reduceTrailerSession(start(), { type: 'player-error', code: 150 })
    s = reduceTrailerSession(s, { type: 'player-error', code: 153 })
    s = reduceTrailerSession(s, { type: 'retry', now: T0 + 1 })
    expect(s).toMatchObject({ phase: 'loading', candidateIndex: 1, fallbackUsed: true })
    expect(s.error).toBeUndefined()
  })

  it('erro de vídeo com a troca já usada não troca de novo', () => {
    let s = reduceTrailerSession(start(3), { type: 'player-error', code: 150 })
    s = reduceTrailerSession(s, { type: 'player-error', code: 101 })
    expect(s.phase).toBe('error')
    expect(s.candidateIndex).toBe(1)
  })
})

describe('trailerErrorMessage', () => {
  it('nunca devolve texto bruto: cada código tem uma frase e o resto cai na genérica', () => {
    const generic = 'O player de trailer não conseguiu iniciar.'
    expect(trailerErrorMessage({ code: 'YT-100', retryable: false })).toMatch(/removido|privado/)
    expect(trailerErrorMessage({ code: 'YT-150', retryable: false })).toBe(trailerErrorMessage({ code: 'YT-101', retryable: false }))
    expect(trailerErrorMessage({ code: 'TRL-REDE', retryable: true })).toBe('Sem conexão com a internet.')
    expect(trailerErrorMessage({ code: 'TRL-TEMPO', retryable: true })).toMatch(/demorou/)
    expect(trailerErrorMessage({ code: 'YT-153', retryable: true })).toBe(generic)
    expect(trailerErrorMessage({ code: 'qualquer coisa http://x?key=segredo', retryable: true })).toBe(generic)
  })
})
