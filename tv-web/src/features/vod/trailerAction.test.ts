import { describe, expect, it } from 'vitest'
import type { TitleMetadataView } from '../../lib/metadata/types'
import {
  trailerActionLabel,
  trailerActionSoftDisabled,
  trailerActionState,
  trailerActionToast,
} from './trailerAction'

const WITH_TRAILER: TitleMetadataView = {
  trailers: [{ videoId: 'provTrail01', kind: 'trailer', origin: 'provider' }],
}

describe('trailerActionState', () => {
  it('candidato conhecido vale mesmo com a consulta ainda em andamento', () => {
    const state = trailerActionState({ metadata: WITH_TRAILER, checking: true, tmdbState: undefined })
    expect(state.status).toBe('available')
  })

  it('sem candidato e ainda consultando: "Trailer…"', () => {
    const state = trailerActionState({ metadata: undefined, checking: true, tmdbState: 'connected' })
    expect(state).toEqual({ status: 'checking' })
    expect(trailerActionLabel(state)).toBe('Trailer…')
    expect(trailerActionSoftDisabled(state)).toBe(true)
  })

  it('sem candidato e sem consulta: indisponível, com a dica do TMDB só sem chave', () => {
    const notConfigured = trailerActionState({ metadata: {}, checking: false, tmdbState: 'not_configured' })
    expect(notConfigured).toEqual({ status: 'unavailable', tmdbConfigured: false })
    expect(trailerActionToast(notConfigured)).toContain('Integrações')

    const unknown = trailerActionState({ metadata: {}, checking: false, tmdbState: undefined })
    expect(unknown).toEqual({ status: 'unavailable', tmdbConfigured: false })

    for (const tmdbState of ['connected', 'refused', 'offline', 'rate_limited'] as const) {
      const state = trailerActionState({ metadata: {}, checking: false, tmdbState })
      expect(state).toEqual({ status: 'unavailable', tmdbConfigured: true })
      expect(trailerActionToast(state)).toBe('Trailer indisponível para este título')
    }
  })

  it('disponível: rótulo do 1º candidato, não é soft-disabled e o OK não gera toast', () => {
    const state = trailerActionState({ metadata: WITH_TRAILER, checking: false, tmdbState: 'connected' })
    expect(trailerActionLabel(state)).toBe('▶ Trailer')
    expect(trailerActionSoftDisabled(state)).toBe(false)
    expect(trailerActionToast(state)).toBeNull()
  })

  it('indisponível e checking sempre se declaram soft-disabled', () => {
    expect(trailerActionSoftDisabled({ status: 'unavailable', tmdbConfigured: true })).toBe(true)
    expect(trailerActionLabel({ status: 'unavailable', tmdbConfigured: true })).toBe('Trailer — indisponível')
    expect(trailerActionToast({ status: 'checking' })).toBe('Consultando trailer')
  })
})
