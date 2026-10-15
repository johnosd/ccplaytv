import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_CHECK_MAX_AGE_MS,
  accessFromAccount,
  decideSourceAccess,
  describeAccount,
  parseExpDate,
} from './sourceAccount'

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

describe('parseExpDate', () => {
  it('aceita segundos Unix como número ou texto (com espaços) e devolve ms', () => {
    expect(parseExpDate(1_800_000_000)).toBe(1_800_000_000_000)
    expect(parseExpDate(' 1800000000 ')).toBe(1_800_000_000_000)
  })

  it('tudo que não é uma data positiva vira null: objeto, array, booleano, NaN, Infinity, negativo, zero', () => {
    for (const raw of [{}, [], true, false, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, '0', '-3', '  ', 'x']) {
      expect(parseExpDate(raw)).toBeNull()
    }
  })
})

describe('describeAccount — calendário local, nunca ms / dia', () => {
  it('virada de dia: 23:59 de hoje → "Vence hoje"; 00:01 de amanhã → "Vence amanhã" (a diferença real é de 2 minutos)', () => {
    const now = at(2026, 9, 30, 23, 59)
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 10, 1, 0, 1) }, now).chip?.label).toBe('Vence amanhã')
    const earlier = at(2026, 9, 30, 0, 1)
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 9, 30, 23, 59) }, earlier).chip?.label).toBe('Vence hoje')
  })

  it('o limite de 7 dias: 7 ainda avisa, 8 não', () => {
    const now = at(2026, 9, 30)
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 10, 7) }, now).chip).toEqual({
      tone: 'warning',
      label: 'Vence em 7 dias',
    })
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 10, 8) }, now)).toMatchObject({ kind: 'valid' })
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 10, 8) }, now).chip).toBeUndefined()
  })

  it('atravessa a mudança de horário de verão sem errar o dia (datas de calendário, não 24 h)', () => {
    // Vence em 3 dias de calendário mesmo que um deles tenha 23 ou 25 horas.
    const now = at(2026, 10, 30, 12)
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 11, 2, 12) }, now).chip?.label).toBe('Vence em 3 dias')
    const nowMarch = at(2026, 3, 27, 12)
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 3, 30, 12) }, nowMarch).chip?.label).toBe('Vence em 3 dias')
  })

  it('vencida: com data mostra "Conta expirada em DD/MM/AAAA"; marcada expirada sem data, só "Conta expirada"', () => {
    const now = at(2026, 9, 30)
    expect(describeAccount({ status: 'active', expiresAt: at(2026, 9, 29) }, now)).toMatchObject({
      kind: 'expired',
      text: 'Conta expirada em 29/09/2026',
    })
    expect(describeAccount({ status: 'expired' }, now)).toMatchObject({ kind: 'expired', text: 'Conta expirada' })
  })

  it('expiresAt null = "Sem data de vencimento"; undefined com status = desconhecido; sem status = desconhecido', () => {
    const now = at(2026, 9, 30)
    expect(describeAccount({ status: 'active', expiresAt: null }, now)).toMatchObject({ kind: 'no_expiry' })
    expect(describeAccount({ status: 'active' }, now)).toEqual({ kind: 'unknown' })
    expect(describeAccount({ expiresAt: at(2027, 1, 1) }, now)).toEqual({ kind: 'unknown' })
  })

  it('credencial recusada vence qualquer data: o texto e o chip são "Credencial inválida"', () => {
    expect(describeAccount({ status: 'refused', expiresAt: at(2030, 1, 1) }, at(2026, 9, 30))).toEqual({
      kind: 'refused',
      text: 'Credencial inválida',
      chip: { tone: 'error', label: 'Credencial inválida' },
    })
  })
})

describe('decideSourceAccess / accessFromAccount', () => {
  const NOW = at(2026, 9, 30)

  it('a idade da verificação decide entre consultar e usar o dado guardado (a fronteira de 24 h é exclusiva)', () => {
    const base = { provider_import_mode: 'xtream_api' as const }
    const exactly = { ...base, account: { status: 'active' as const, expiresAt: at(2027, 1, 1), checkedAt: NOW - ACCOUNT_CHECK_MAX_AGE_MS } }
    expect(decideSourceAccess(exactly, NOW)).toEqual({ action: 'open' })
    const older = { ...base, account: { ...exactly.account, checkedAt: NOW - ACCOUNT_CHECK_MAX_AGE_MS - 1 } }
    expect(decideSourceAccess(older, NOW)).toEqual({ action: 'check' })
  })

  it('M3U avulsa e Modo limitado nunca são impedidas, nem pelo dado guardado', () => {
    const refused = { status: 'refused' as const, checkedAt: NOW }
    expect(accessFromAccount({ provider_import_mode: 'legacy_m3u', account: refused }, NOW)).toEqual({ action: 'open' })
    expect(accessFromAccount({ provider_import_mode: null, account: refused }, NOW)).toEqual({ action: 'open' })
  })

  it('sem dado guardado (ou sem status), a falha de rede abre a lista — nunca impede sozinha', () => {
    expect(accessFromAccount({ provider_import_mode: 'xtream_api' }, NOW)).toEqual({ action: 'open' })
    expect(accessFromAccount({ provider_import_mode: 'xtream_api', account: { checkedAt: NOW } }, NOW)).toEqual({ action: 'open' })
  })

  it('"expired" guardada sem data impede com expiresAt indefinido', () => {
    expect(
      accessFromAccount({ provider_import_mode: 'xtream_api', account: { status: 'expired', checkedAt: NOW } }, NOW),
    ).toEqual({ action: 'blocked', reason: 'expired', expiresAt: undefined })
  })
})
