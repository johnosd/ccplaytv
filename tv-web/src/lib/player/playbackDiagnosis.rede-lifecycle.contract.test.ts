/**
 * Contrato da feature 042 (rede, lifecycle e erros acionáveis) — diagnóstico
 * de reprodução como função pura (`logic/erros-acionaveis.md` §2).
 *
 * Fixa: categoria, código, ação primária e se pode reconectar sozinho; e que
 * nada do erro cru do motor atravessa para a "Info técnica".
 */
import { describe, expect, it } from 'vitest'
import { diagnosePlayback, type PlaybackDiagnosisInput } from './playbackDiagnosis'

const BASE: PlaybackDiagnosisInput = {
  error: null,
  online: true,
  mediaKind: 'movie',
  engine: 'avplay',
  at: 1_700_000_000_000,
}

describe('diagnosePlayback — contrato da feature 042', () => {
  // US2/AC1-AC3, FR-012/FR-013: rede × formato × fonte, no máximo 3 ações, ação primária certa.
  it('distingue rede, formato, fonte e desconhecido, com a ação primária e o auto-reconectar certos', () => {
    const offline = diagnosePlayback({ ...BASE, online: false, error: { code: 'PLAYER_ERROR_CONNECTION_FAILED' } })
    expect(offline.code).toBe('NET-01')
    expect(offline.category).toBe('network')
    expect(offline.actions).toEqual(['retry'])
    expect(offline.autoReconnect).toBe(false) // sem rede nunca tenta sozinho (FR-008)

    const network = diagnosePlayback({ ...BASE, error: { code: 'PLAYER_ERROR_CONNECTION_FAILED' } })
    expect(network.code).toBe('PLAY-01')
    expect(network.category).toBe('network')
    expect(network.actions[0]).toBe('retry')
    expect(network.autoReconnect).toBe(true)

    const format = diagnosePlayback({ ...BASE, error: { code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE' } })
    expect(format.code).toBe('PLAY-02')
    expect(format.category).toBe('format')
    expect(format.actions[0]).toBe('info') // formato não melhora tentando de novo
    expect(format.actions).not.toContain('retry')
    expect(format.autoReconnect).toBe(false)

    const refused = diagnosePlayback({ ...BASE, sourceAccess: 'refused', error: { code: 'PLAYER_ERROR_CONNECTION_FAILED' } })
    expect(refused.code).toBe('SRC-401')
    expect(refused.category).toBe('source')
    expect(refused.actions[0]).toBe('edit-credentials')
    expect(refused.autoReconnect).toBe(false)

    const expired = diagnosePlayback({ ...BASE, sourceAccess: 'expired', error: null })
    expect(expired.code).toBe('SRC-402')
    expect(expired.actions[0]).toBe('edit-credentials')

    const unknown = diagnosePlayback({ ...BASE, error: { code: 'ALGO_QUE_NINGUEM_CONHECE' } })
    expect(unknown.code).toBe('PLAY-04')
    expect(unknown.category).toBe('unknown')
    expect(unknown.actions).toEqual(['retry', 'info'])
    expect(unknown.autoReconnect).toBe(true)

    for (const diagnosis of [offline, network, format, refused, expired, unknown]) {
      expect(diagnosis.actions.length).toBeGreaterThanOrEqual(1)
      expect(diagnosis.actions.length).toBeLessThanOrEqual(3)
    }
  })

  // US2/AC4, FR-014/FR-019, Constitution "Segredos Fora dos Clientes e dos Logs": nada cru atravessa.
  it('a Info técnica e o diagnóstico nunca carregam URL, host, usuário, senha nem o texto cru do motor', () => {
    const diagnosis = diagnosePlayback({
      ...BASE,
      error: {
        code: 'http://usuario:senha@exemplo.invalid/live/1.ts?token=abc',
        message: 'falha em http://usuario:senha@exemplo.invalid/live/1.ts',
      },
    })

    const serialized = JSON.stringify(diagnosis)
    for (const secret of ['usuario', 'senha', 'exemplo.invalid', 'token', 'abc', 'http']) {
      expect(serialized).not.toContain(secret)
    }
    expect(diagnosis.code).toBe('PLAY-04') // código desconhecido nunca vira texto na tela
    expect(diagnosis.technical).toEqual({
      code: 'PLAY-04',
      category: 'unknown',
      mediaKind: 'movie',
      engine: 'avplay',
      at: BASE.at,
    })
  })
})
