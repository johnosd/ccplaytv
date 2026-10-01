import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_CHECK_MAX_AGE_MS,
  decideSourceAccess,
  describeAccount,
  parseExpDate,
} from './sourceAccount'

// Datas locais ao meio-dia: o texto usa o calendário local da TV, e meio-dia
// mantém o dia certo em qualquer fuso do ambiente de teste.
const NOW = new Date(2026, 8, 30, 12).getTime() // 30/09/2026
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

describe('Conta da fonte — contrato da feature 034', () => {
  // US1 AC1–AC5; FR-003, FR-004, FR-005, FR-016; SC-001
  it('descreve os cinco casos de vencimento, "hoje", e credencial recusada', () => {
    for (const raw of ['0', 0, -5, '', undefined, null, 'abc']) {
      expect(parseExpDate(raw)).toBeNull()
    }
    expect(parseExpDate('1790000000')).toBe(1790000000 * 1000)

    const valid = describeAccount({ status: 'active', expiresAt: day(2026, 11, 12), checkedAt: NOW }, NOW)
    expect(valid.kind).toBe('valid')
    expect(valid.text).toBe('Conta válida até 12/11/2026')
    expect(valid.chip).toBeUndefined()

    const soon = describeAccount({ status: 'active', expiresAt: day(2026, 10, 3, 9), checkedAt: NOW }, NOW)
    expect(soon.kind).toBe('expiring')
    expect(soon.chip).toEqual({ tone: 'warning', label: 'Vence em 3 dias' })

    const today = describeAccount({ status: 'active', expiresAt: day(2026, 9, 30, 22), checkedAt: NOW }, NOW)
    expect(today.chip).toEqual({ tone: 'warning', label: 'Vence hoje' })

    // "Ativa" com data no passado conta como expirada (FR-004).
    const past = describeAccount({ status: 'active', expiresAt: day(2026, 9, 29), checkedAt: NOW }, NOW)
    expect(past.kind).toBe('expired')
    expect(past.chip).toEqual({ tone: 'error', label: 'Conta expirada' })

    const none = describeAccount({ status: 'active', expiresAt: null, checkedAt: NOW }, NOW)
    expect(none.kind).toBe('no_expiry')
    expect(none.text).toBe('Sem data de vencimento')
    expect(none.chip).toBeUndefined()

    const refused = describeAccount({ status: 'refused', checkedAt: NOW }, NOW)
    expect(refused.chip).toEqual({ tone: 'error', label: 'Credencial inválida' })

    expect(describeAccount(undefined, NOW).kind).toBe('unknown')
  })

  // US2; FR-008, FR-010, FR-022; constitution 1.7.0 ("Sem Conta Obrigatória", exceção)
  it('decide abrir, verificar ou impedir a lista pela idade e pelo resultado da verificação', () => {
    const fresh = NOW - 60_000
    const stale = NOW - ACCOUNT_CHECK_MAX_AGE_MS - 1

    // Fonte que não fala o protocolo Xtream nunca é verificada nem impedida.
    expect(decideSourceAccess({ provider_import_mode: null }, NOW)).toEqual({ action: 'open' })
    expect(
      decideSourceAccess(
        { provider_import_mode: 'legacy_m3u', account: { status: 'refused', checkedAt: fresh } },
        NOW,
      ),
    ).toEqual({ action: 'open' })

    // Nunca verificada ou verificada há mais de 24 h → consulta primeiro.
    expect(decideSourceAccess({ provider_import_mode: 'xtream_api' }, NOW)).toEqual({ action: 'check' })
    expect(
      decideSourceAccess(
        { provider_import_mode: 'xtream_api', account: { status: 'refused', checkedAt: stale } },
        NOW,
      ),
    ).toEqual({ action: 'check' })

    // Verificação recente: decide pelo dado guardado.
    expect(
      decideSourceAccess(
        { provider_import_mode: 'xtream_api', account: { status: 'active', expiresAt: day(2026, 12, 1), checkedAt: fresh } },
        NOW,
      ),
    ).toEqual({ action: 'open' })
    expect(
      decideSourceAccess(
        { provider_import_mode: 'xtream_api', account: { status: 'refused', checkedAt: fresh } },
        NOW,
      ),
    ).toEqual({ action: 'blocked', reason: 'refused' })
    // A data guardada passou desde a última verificação (que dizia "ativa").
    const expiresAt = day(2026, 9, 29)
    expect(
      decideSourceAccess(
        { provider_import_mode: 'xtream_api', account: { status: 'active', expiresAt, checkedAt: fresh } },
        NOW,
      ),
    ).toEqual({ action: 'blocked', reason: 'expired', expiresAt })
  })
})
