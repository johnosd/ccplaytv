import { describe, expect, it } from 'vitest'
import { describeError, isErrorCode, listErrorCodes, providerErrorCode } from './errorCatalog'
import type { ProviderFailureKind } from '../catalog/xtreamConnector'

describe('errorCatalog (feature 042, D-001)', () => {
  it('todo código registrado tem título, descrição e ação, sem URL nem credencial', () => {
    for (const code of listErrorCodes()) {
      const entry = describeError(code)
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
      expect(entry.primaryAction.length).toBeGreaterThan(0)
      expect(`${entry.title} ${entry.description}`).not.toMatch(/https?:|@|senha:/i)
    }
  })

  it('registra os códigos que já existiam, sem renomear', () => {
    for (const code of ['EPG-02', 'STO-01', 'TRL-REDE', 'TRL-TEMPO', 'TRL-PONTE']) {
      expect(isErrorCode(code)).toBe(true)
    }
    expect(isErrorCode('QUALQUER-99')).toBe(false)
  })

  it('o rótulo da ação de nova tentativa é "Tentar de novo" (D-012)', () => {
    expect(describeError('NET-01').primaryAction).toBe('Tentar de novo')
    expect(describeError('PLAY-01').primaryAction).toBe('Tentar de novo')
  })

  // T005: um record exaustivo falha no `tsc` se um ProviderFailureKind novo ficar sem código.
  it('providerErrorCode cobre todo ProviderFailureKind', () => {
    const expected: Record<ProviderFailureKind, string> = {
      invalid_credentials: 'SRC-401',
      subscription_expired: 'SRC-402',
      rate_limited: 'API-429',
      direct_connection_refused: 'NET-02',
      network_failure: 'NET-02',
    }
    for (const kind of Object.keys(expected) as ProviderFailureKind[]) {
      expect(providerErrorCode(kind, true)).toBe(expected[kind])
    }
    expect(providerErrorCode('network_failure', false)).toBe('NET-01')
  })
})
