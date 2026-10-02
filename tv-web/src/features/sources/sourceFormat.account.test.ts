import { describe, expect, it } from 'vitest'
import type { SourceOut } from '../import/importApi'
import { accountChipOf, formatAccount, sourceAlertChips } from './sourceFormat'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const NOW = at(2026, 9, 30)

function makeSource(overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id: 'fonte',
    type: 'provider_credentials',
    display_name: 'Painel',
    connection_state: 'synced',
    last_successful_sync_at: '2026-09-29T12:00:00.000Z',
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

const xtream = (expiresAt: number | null, status: 'active' | 'expired' | 'refused' = 'active') =>
  makeSource({ account: { status, expiresAt, checkedAt: NOW } })

describe('formatAccount / accountChipOf — os cinco casos do SC-001', () => {
  it('futuro > 7 dias: "Conta válida até DD/MM/AAAA", sem chip', () => {
    const source = xtream(at(2026, 11, 12))
    expect(formatAccount(source, NOW)).toBe('Conta válida até 12/11/2026')
    expect(accountChipOf(source, NOW)).toBeUndefined()
  })

  it('≤ 7 dias: o mesmo texto e o chip âmbar "Vence em 3 dias"', () => {
    const source = xtream(at(2026, 10, 3))
    expect(formatAccount(source, NOW)).toBe('Conta válida até 03/10/2026')
    expect(accountChipOf(source, NOW)).toEqual({ tone: 'warning', label: 'Vence em 3 dias' })
  })

  it('passado: "Conta expirada em …" e o chip de erro "Conta expirada"', () => {
    const source = xtream(at(2026, 9, 29))
    expect(formatAccount(source, NOW)).toBe('Conta expirada em 29/09/2026')
    expect(accountChipOf(source, NOW)).toEqual({ tone: 'error', label: 'Conta expirada' })
  })

  it('sem data (0/ausente): "Sem data de vencimento", sem chip', () => {
    const source = xtream(null)
    expect(formatAccount(source, NOW)).toBe('Sem data de vencimento')
    expect(accountChipOf(source, NOW)).toBeUndefined()
  })

  it('"ativa" com data no passado conta como expirada (FR-004)', () => {
    expect(accountChipOf(xtream(at(2026, 9, 1), 'active'), NOW)?.label).toBe('Conta expirada')
  })

  it('M3U avulsa e Modo limitado: nenhum texto de vencimento e nenhum chip, mesmo com conta guardada (FR-022)', () => {
    for (const mode of [null, 'legacy_m3u'] as const) {
      const source = makeSource({ provider_import_mode: mode, account: { status: 'refused', checkedAt: NOW } })
      expect(formatAccount(source, NOW)).toBeUndefined()
      expect(accountChipOf(source, NOW)).toBeUndefined()
    }
  })

  it('fonte nunca verificada: nada a mostrar', () => {
    expect(formatAccount(makeSource(), NOW)).toBeUndefined()
  })
})

describe('sourceAlertChips — só quando há algo a agir (FR-006)', () => {
  it('lista saudável e conta longe do vencimento: nenhum chip', () => {
    expect(sourceAlertChips(xtream(at(2026, 12, 1)), NOW)).toEqual([])
  })

  it('ordem: Sincronizando, conta, erro de sincronização, erro de EPG', () => {
    const source = makeSource({
      connection_state: 'error',
      account: { status: 'active', expiresAt: at(2026, 10, 2), checkedAt: NOW },
      epg: { state: 'error', hasManualUrl: false, offsetHours: 0 } as SourceOut['epg'],
    })
    expect(sourceAlertChips(source, NOW, { syncing: true }).map((c) => c.label)).toEqual([
      'Sincronizando',
      'Vence em 2 dias',
      'Erro na última sincronização',
      'Erro no EPG',
    ])
  })

  it('credencial inválida e conta expirada já explicam a falha: nada de "Erro na última sincronização" junto', () => {
    expect(sourceAlertChips({ ...xtream(null, 'refused'), connection_state: 'error' }, NOW).map((c) => c.label)).toEqual([
      'Credencial inválida',
    ])
    expect(sourceAlertChips({ ...xtream(at(2026, 9, 1)), connection_state: 'error' }, NOW).map((c) => c.label)).toEqual([
      'Conta expirada',
    ])
  })

  it('erro de sincronização numa M3U avulsa continua sendo só o erro', () => {
    const source = makeSource({ provider_import_mode: null, connection_state: 'error' })
    expect(sourceAlertChips(source, NOW)).toEqual([{ tone: 'error', label: 'Erro na última sincronização' }])
  })

  it('tons: expirada e recusada são erro, vencimento próximo é âmbar, Sincronizando é neutro', () => {
    expect(sourceAlertChips(xtream(at(2026, 9, 29)), NOW)[0].tone).toBe('error')
    expect(sourceAlertChips(xtream(at(2026, 10, 2)), NOW)[0].tone).toBe('warning')
    expect(sourceAlertChips(xtream(at(2026, 12, 1)), NOW, { syncing: true })[0].tone).toBe('neutral')
  })
})
