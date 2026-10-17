import { describe, expect, it } from 'vitest'
import type { Dashboard, LicenseDevice } from '../api'
import { summaryState } from './summaryState'

const NOW = Date.UTC(2026, 9, 16, 12)
const device = (state: LicenseDevice['license']['state'], expiresAt: number, serverTime = NOW): LicenseDevice =>
  ({ deviceId: 'tv', displayId: 'A0:8C:FD:19:0A:8C', license: { state, startsAt: NOW - 86400000, expiresAt, generation: 1, serverTime } })
const dashboard = (snapshot: boolean, stale = false): Dashboard =>
  ({ configurations: [], operations: [], stale, snapshot: snapshot ? { capturedAt: '2026-10-16T11:00:00.000Z', sources: [], revisions: [] } : null })

describe('resumo da TV (feature 077)', () => {
  it('licença: teste = atenção, ativa = ok, vencida/revogada = perigo com Renovar; sem dispositivo = desconhecido', () => {
    expect(summaryState(device('trial', NOW + 86400000), undefined, NOW)).toMatchObject({ tone: 'warning', licenseLabel: 'license_trial', needsRenew: false })
    expect(summaryState(device('active', NOW + 86400000 * 300), undefined, NOW)).toMatchObject({ tone: 'success', licenseLabel: 'license_active', needsRenew: false })
    expect(summaryState(device('active', NOW - 1000), undefined, NOW)).toMatchObject({ tone: 'danger', licenseLabel: 'licenseExpired', needsRenew: true })
    expect(summaryState(device('revoked', NOW + 86400000), undefined, NOW)).toMatchObject({ tone: 'danger', licenseLabel: 'license_revoked', needsRenew: true })
    expect(summaryState(undefined, undefined, NOW)).toMatchObject({ tone: 'unknown', needsRenew: false })
  })

  it('o vencimento usa o relógio do servidor quando ele é mais novo que o do navegador', () => {
    expect(summaryState(device('active', NOW + 1000, NOW + 5000), undefined, NOW - 86400000)).toMatchObject({ tone: 'danger' })
  })

  it('último contato: sem snapshot = nenhum, snapshot velho = stale, senão ok com a hora que a TV informou', () => {
    expect(summaryState(undefined, undefined, NOW).contact).toBe('none')
    expect(summaryState(undefined, dashboard(false), NOW).contact).toBe('none')
    expect(summaryState(undefined, dashboard(true, true), NOW).contact).toBe('stale')
    expect(summaryState(undefined, dashboard(true), NOW)).toMatchObject({ contact: 'ok', contactAt: '2026-10-16T11:00:00.000Z' })
  })
})
