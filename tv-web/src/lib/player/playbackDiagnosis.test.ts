import { describe, expect, it } from 'vitest'
import { diagnosePlayback, type PlaybackDiagnosisInput } from './playbackDiagnosis'

const BASE: PlaybackDiagnosisInput = { error: null, online: true, mediaKind: 'channel', engine: 'avplay', at: 1 }

describe('diagnosePlayback — casos extras (feature 042)', () => {
  it('entradas estranhas nunca lançam e caem em PLAY-04', () => {
    for (const error of [null, { code: null }, { code: '' }, { code: 'Error' }, { code: 'x'.repeat(500) }]) {
      expect(diagnosePlayback({ ...BASE, error }).code).toBe('PLAY-04')
    }
  })

  it('canal ao vivo "terminou" (stream_completed) é falha de rede e reconecta', () => {
    const diagnosis = diagnosePlayback({ ...BASE, error: { code: 'stream_completed', message: 'A transmissão foi interrompida.' } })
    expect(diagnosis.code).toBe('PLAY-01')
    expect(diagnosis.autoReconnect).toBe(true)
  })

  it('a conta recusada/expirada vence a rede e o erro do motor', () => {
    const refused = diagnosePlayback({ ...BASE, online: false, sourceAccess: 'refused', error: { code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE' } })
    expect(refused.code).toBe('SRC-401')
  })

  it('o título e a mensagem vêm da tabela, nunca do erro do motor', () => {
    const diagnosis = diagnosePlayback({ ...BASE, error: { code: 'PLAYER_ERROR_CONNECTION_FAILED', message: 'texto do motor' } })
    expect(diagnosis.title).not.toContain('motor')
    expect(diagnosis.message).not.toContain('motor')
  })
})
