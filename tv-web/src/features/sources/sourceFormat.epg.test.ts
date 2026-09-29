import { describe, expect, it } from 'vitest'
import type { SourceOut } from '../import/importApi'
import { formatEpgStatus } from './sourceFormat'

const BASE: SourceOut = {
  id: 's',
  type: 'provider_credentials',
  display_name: 'Sala',
  connection_state: 'synced',
  last_successful_sync_at: null,
  provider_import_mode: null,
  limited_reason: null,
  provider_dns: null,
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

const withEpg = (epg: SourceOut['epg']): SourceOut => ({ ...BASE, epg })

describe('formatEpgStatus (FR-015)', () => {
  it('cada estado tem seu texto, e "sincronizando" vem do executor e vence o resto', () => {
    expect(formatEpgStatus(BASE, false)).toBe('EPG não configurado')
    expect(formatEpgStatus(withEpg({ state: 'not_configured', offsetHours: 0 }), false)).toBe('EPG não configurado')
    expect(formatEpgStatus(withEpg({ state: 'disabled', offsetHours: 0 }), false)).toBe('EPG desativado')
    expect(formatEpgStatus(withEpg({ state: 'never_synced', offsetHours: 0, urlOrigin: 'panel' }), false)).toBe('EPG ainda não sincronizado')
    expect(formatEpgStatus(withEpg({ state: 'error', offsetHours: 0, errorKind: 'network' }), false)).toBe('Erro no EPG · EPG-02')
    expect(formatEpgStatus(withEpg({ state: 'linked', offsetHours: 0 }), false)).toBe('EPG vinculado')
    expect(formatEpgStatus(withEpg({ state: 'linked', offsetHours: 0 }), true)).toBe('Sincronizando EPG')
  })

  it('vinculado traz a data e hora da última sincronização (FR-015)', () => {
    const text = formatEpgStatus(withEpg({ state: 'linked', offsetHours: 0, lastSyncAt: Date.UTC(2026, 8, 29, 14, 2) }), false)
    expect(text).toMatch(/^EPG vinculado · atualizado em \d{2}\/\d{2}/)
  })
})
