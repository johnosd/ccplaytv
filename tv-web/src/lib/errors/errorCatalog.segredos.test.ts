import { describe, expect, it } from 'vitest'
import { describeError, listErrorCodes, providerErrorCode } from './errorCatalog'
import { diagnoseFetchFailure, diagnosePlayback } from '../player/playbackDiagnosis'

/**
 * Feature 042, SC-004 / FR-019 (T051): nada do que a tabela de erros devolve —
 * textos, códigos, ações, diagnóstico e "Info técnica" — pode conter URL, host,
 * usuário, senha ou token, qualquer que seja a entrada. As telas migradas só
 * montam texto a partir daqui (ver os testes de tela de cada uma).
 */

// Valores de segredo (não palavras comuns): "senha"/"usuário" aparecem legitimamente nos textos
// ("recusou o usuário ou a senha"); o que nunca pode aparecer é o VALOR que o motor embute.
const SECRETS = ['http://', 'https://', 'usuario:senha', 'exemplo.invalid', 'token=', '@']

function assertClean(label: string, value: unknown) {
  const text = JSON.stringify(value)
  for (const secret of SECRETS) {
    expect(text, `${label} não pode conter "${secret}"`).not.toContain(secret)
  }
}

describe('segredos fora de toda a taxonomia de erros (feature 042)', () => {
  it('toda entrada da tabela é limpa', () => {
    for (const code of listErrorCodes()) assertClean(code, describeError(code))
  })

  it('o diagnóstico de reprodução é limpo com qualquer erro do motor, inclusive um que embute a URL', () => {
    const hostile = 'http://usuario:senha@exemplo.invalid/live/1.ts?token=abc'
    for (const online of [true, false]) {
      for (const sourceAccess of [null, 'refused', 'expired'] as const) {
        assertClean(
          `diagnose(online=${online}, access=${sourceAccess})`,
          diagnosePlayback({
            error: { code: hostile, message: hostile },
            online,
            mediaKind: 'movie',
            engine: 'avplay',
            at: 1,
            sourceAccess,
          }),
        )
      }
    }
    assertClean('fetch 409', diagnoseFetchFailure({ status: 409, online: true, at: 1 }))
    assertClean('fetch outro', diagnoseFetchFailure({ status: 500, online: false, at: 1 }))
  })

  it('o mapeamento de falha do provedor devolve só um código', () => {
    for (const kind of ['invalid_credentials', 'subscription_expired', 'rate_limited', 'direct_connection_refused', 'network_failure'] as const) {
      expect(providerErrorCode(kind, true)).toMatch(/^[A-Z]+-\d+$/)
    }
  })
})
