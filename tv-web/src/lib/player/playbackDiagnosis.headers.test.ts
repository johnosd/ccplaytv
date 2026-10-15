/** Feature 058 (T011, `logic/headers.md` §5): onde o `PLAY-05` entra na ordem do diagnóstico. */
import { describe, expect, it } from 'vitest'
import { diagnosePlayback, type PlaybackDiagnosisInput } from './playbackDiagnosis'

const base: PlaybackDiagnosisInput = { error: { code: null }, online: true, mediaKind: 'channel', engine: 'avplay', at: 0 }

describe('playbackDiagnosis — header não enviado (feature 058)', () => {
  it('header recusado + falha genérica → PLAY-05, fonte, só "info", sem reconexão', () => {
    const d = diagnosePlayback({ ...base, headersNotSent: true })
    expect(d.code).toBe('PLAY-05')
    expect(d.category).toBe('source')
    expect(d.actions).toEqual(['info'])
    expect(d.autoReconnect).toBe(false)
    expect(d.message).toBe('Esta lista exige um header que esta TV não envia.')
  })

  it('erro de formato vence: um header não causa codec errado', () => {
    const d = diagnosePlayback({ ...base, error: { code: 'PLAYER_ERROR_NOT_SUPPORTED_FORMAT' }, headersNotSent: true })
    expect(d.code).toBe('PLAY-02')
  })

  it('sem rede vence', () => {
    expect(diagnosePlayback({ ...base, online: false, headersNotSent: true }).code).toBe('NET-01')
  })

  it('conta recusada/expirada vence', () => {
    expect(diagnosePlayback({ ...base, sourceAccess: 'refused', headersNotSent: true }).code).toBe('SRC-401')
    expect(diagnosePlayback({ ...base, sourceAccess: 'expired', headersNotSent: true }).code).toBe('SRC-402')
  })

  it('sem headersNotSent, os vereditos de sempre', () => {
    expect(diagnosePlayback(base).code).toBe('PLAY-04')
    expect(diagnosePlayback({ ...base, error: { code: 'PLAYER_ERROR_NETWORK' } }).code).toBe('PLAY-01')
    expect(diagnosePlayback({ ...base, error: { code: 'PLAYER_ERROR_STREAM_NOT_FOUND' } }).code).toBe('PLAY-03')
  })
})
